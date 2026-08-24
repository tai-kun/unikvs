import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, test } from "vitest";

import acquireLockedPort from "../src/_acquire-locked-port.js";

describe("acquireLockedPort", () => {
  test("1024 以上 65535 以下のポート番号を確保する", async ({ expect }) => {
    // 実行
    using port = await acquireLockedPort();

    // 検証
    expect(port.number).toBeGreaterThanOrEqual(1024);
    expect(port.number).toBeLessThanOrEqual(65535);
  });

  test("確保中はロックファイルが存在し、解放すると削除される", async ({ expect }) => {
    // 実行
    using port = await acquireLockedPort();
    const lockFilePath = join(tmpdir(), "locked-ports", port.number.toString(10));

    // 検証: 確保中はロックファイルが存在する
    expect(existsSync(lockFilePath)).toBe(true);

    // 実行
    port.release();

    // 検証: 解放後はロックファイルが削除される
    expect(existsSync(lockFilePath)).toBe(false);
  });

  test("release を複数回呼び出してもエラーにならない", async ({ expect }) => {
    // 準備
    const port = await acquireLockedPort();

    // 実行と検証
    expect(() => {
      port.release();
      port.release();
    }).not.toThrow();
  });

  test("[Symbol.dispose] でロックを解放する", async ({ expect }) => {
    // 準備
    let lockFilePath: string;

    // 実行
    {
      using port = await acquireLockedPort();
      lockFilePath = join(tmpdir(), "locked-ports", port.number.toString(10));
      expect(existsSync(lockFilePath)).toBe(true);
    }

    // 検証: スコープを抜けるとロックファイルが削除される
    expect(existsSync(lockFilePath)).toBe(false);
  });

  test("文字列変換ではポート番号の 10 進表現を返す", async ({ expect }) => {
    // 実行
    using port = await acquireLockedPort();

    // 検証
    expect(port.toString()).toBe(port.number.toString(10));
    expect(String(port)).toBe(port.number.toString(10));
  });

  test("数値変換ではポート番号を返す", async ({ expect }) => {
    // 実行
    using port = await acquireLockedPort();

    // 検証
    expect(Number(port)).toBe(port.number);
    expect(port.valueOf()).toBe(port.number);
  });
});
