import { setGlobalConfig, deleteGlobalConfig } from "valibot";
import { test as vitest, describe } from "vite-plus/test";

import {
  InvalidMaxBytesError,
  InvalidChunkTypeError,
  InvalidMaxEntriesError,
  InvalidSizeOfResultError,
} from "../src/errors.js";

/**
 * 言語設定をテスト内でのみ変更するフィクスチャーです。
 * 設定した言語はテスト終了後に削除され、ほかのテストに影響しません。
 * ブラウザー環境での日本語メッセージを検証するために使用します。
 */
const test = vitest.extend<{ setLang: (lang: string) => void }>({
  async setLang({}, use) {
    await use((lang) => {
      setGlobalConfig({ lang });
    });
    deleteGlobalConfig();
  },
});
describe("エラーメッセージ（日本語、ブラウザー）", () => {
  test("InvalidChunkTypeError は日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備：
    setLang("ja");

    // 実行：
    const error = new InvalidChunkTypeError({
      key: "foo",
      chunk: "bar",
    });

    // 検証：
    expect(error.meta.chunkType).toBe("string");
    expect(error.message).toBe(
      'キー "foo" のチャンク型に Uint8Array<ArrayBuffer> を期待しましたが、string を得ました',
    );
  });

  test("InvalidMaxEntriesError は日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備：
    setLang("ja");

    // 実行と検証：
    expect(new InvalidMaxEntriesError({ actual: -1 }).message).toBe(
      "maxEntries は 0 以上の整数でなければなりません。受け取った値: -1",
    );
  });

  test("InvalidMaxBytesError は日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備：
    setLang("ja");

    // 実行と検証：
    expect(new InvalidMaxBytesError({ actual: -1 }).message).toBe(
      "maxBytes は 0 以上の有限数でなければなりません。受け取った値: -1",
    );
  });

  test("InvalidSizeOfResultError は日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備：
    setLang("ja");

    // 実行と検証：
    expect(
      new InvalidSizeOfResultError({
        key: "foo",
        actual: -1,
      }).message,
    ).toBe('キー "foo" の sizeOf は 0 以上の有限数を返さなければなりません。受け取った値: -1');
  });
});
