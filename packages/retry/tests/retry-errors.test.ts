import { test, describe } from "vite-plus/test";

import {
  RetryExhaustedError,
  RetryInvalidOptionError,
  RetryUnsupportedOperationError,
} from "../src/errors.js";

/**
 * 不正なオプション値がメッセージ内でどう整形されるかを取り出すため、同じオプション名で RetryInvalidOptionError を生成します。
 */
function invalidOptionMessage(actual: unknown): string {
  return new RetryInvalidOptionError({
    name: "value",
    actual,
  }).message;
}

describe("エラーメッセージ", () => {
  test("リトライ枯渇と未サポート操作の内容を英語で表示する", ({ expect }) => {
    // 実行と検証：
    expect(
      new RetryExhaustedError({
        attempts: 3,
        operation: "read",
      }).message,
    ).toBe('Retry exhausted after 3 attempt(s) for operation "read".');
    expect(
      new RetryUnsupportedOperationError({
        storage: "Bare",
        operation: "getReadable",
      }).message,
    ).toBe('Storage "Bare" does not support getReadable.');
  });

  test("不正なオプションの実値を種類に応じて整形する", ({ expect }) => {
    // 実行と検証：
    expect(invalidOptionMessage("bogus")).toBe('Invalid Retry option "value": "bogus"');
    expect(invalidOptionMessage(0)).toBe('Invalid Retry option "value": 0');
    expect(invalidOptionMessage(false)).toBe('Invalid Retry option "value": false');
    expect(invalidOptionMessage(null)).toBe('Invalid Retry option "value": null');
    expect(invalidOptionMessage({ a: 1 })).toBe('Invalid Retry option "value": {"a":1}');
  });

  test("循環参照は [object Object] にフォールバックする", ({ expect }) => {
    // 準備：
    const actual: Record<string, unknown> = {};
    actual["self"] = actual;

    // 実行と検証：
    expect(invalidOptionMessage(actual)).toBe('Invalid Retry option "value": [object Object]');
  });
});
