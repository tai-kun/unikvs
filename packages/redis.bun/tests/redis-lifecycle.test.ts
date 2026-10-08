import { describe } from "vitest";

import Redis from "../src/redis.js";
import { createStorage, test } from "./_helpers.js";

describe("ライフサイクル管理", () => {
  test("open を 2 回呼び出しても isOpen は true のままで操作できる", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "double-open.txt";
    const data = new TextEncoder().encode("double open");

    // 実行
    await storage.open();
    await storage.write({ key, data, signal, vars: {} });

    // 検証
    expect(storage.isOpen).toBe(true);
    await expect(storage.read({ key, signal })).resolves.toStrictEqual(data);
  });

  test("close を呼び出すと、isOpen が false に戻る", ({ expect, storage }) => {
    // 実行
    storage.close();

    // 検証
    expect(storage.isOpen).toBe(false);
  });

  test("close を 2 回呼び出すと 2 回目は TypeError になる", ({ expect, storage }) => {
    // 準備
    storage.close();

    // 実行と検証
    expect(() => storage.close()).toThrow(TypeError);
  });

  test("close 後に open し直しても同じインスタンスでデータを読み取れる", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "reopen-same-instance.bin";
    const data = new Uint8Array([9, 8, 7, 6]);
    await storage.write({ key, data, signal, vars: {} });

    // 実行
    storage.close();
    await storage.open();

    // 検証
    expect(storage.isOpen).toBe(true);
    await expect(storage.read({ key, signal })).resolves.toStrictEqual(data);
  });

  test("別インスタンスから同じプレフィックスのデータを読み取れる", async ({
    expect,
    keyPrefix,
    signal,
    storage,
    url,
  }) => {
    // 準備
    const key = "shared-prefix.bin";
    const data = new Uint8Array([1, 3, 5, 7]);
    await storage.write({ key, data, signal, vars: {} });

    const other = createStorage(url, keyPrefix);
    await other.open();

    try {
      // 実行
      const result = await other.read({ key, signal });

      // 検証
      expect(result).toStrictEqual(data);
    } finally {
      other.close();
    }
  });

  test("プレフィックスが異なるインスタンスは同じキーを共有しない", async ({
    expect,
    signal,
    storage,
    url,
  }) => {
    // 準備
    const key = "isolated.bin";
    await storage.write({ key, data: new Uint8Array([1]), signal, vars: {} });

    const other = createStorage(url, "unikvs-other:");
    await other.open();

    try {
      // 実行と検証
      await expect(other.exists({ key, signal })).resolves.toBe(false);
    } finally {
      other.close();
    }
  });

  test("接続に失敗したとき、open は拒否され isOpen は false のままである", async ({
    expect,
    keyPrefix,
  }) => {
    // 準備
    // 待機時間を抑えるため、応答しないポートと再試行なしの設定を使用する。
    const unreachable = new Redis("redis://127.0.0.1:1", {
      keyPrefix,
      autoReconnect: false,
      connectionTimeout: 1000,
      maxRetries: 0,
    });

    // 実行と検証
    await expect(unreachable.open()).rejects.toThrow();
    expect(unreachable.isOpen).toBe(false);
  });

  test("close 後の write は TypeError で拒否される", async ({ expect, signal, storage }) => {
    // 準備
    storage.close();

    // 実行と検証
    await expect(
      storage.write({ key: "after-close.bin", data: new Uint8Array([1]), signal, vars: {} }),
    ).rejects.toThrow(TypeError);
  });

  test("close 後の read は TypeError で拒否される", async ({ expect, signal, storage }) => {
    // 準備
    storage.close();

    // 実行と検証
    await expect(storage.read({ key: "after-close.bin", signal })).rejects.toThrow(TypeError);
  });

  test("close 後の exists は TypeError で拒否される", async ({ expect, signal, storage }) => {
    // 準備
    storage.close();

    // 実行と検証
    await expect(storage.exists({ key: "after-close.bin", signal })).rejects.toThrow(TypeError);
  });

  test("close 後の delete は TypeError で拒否される", async ({ expect, signal, storage }) => {
    // 準備
    storage.close();

    // 実行と検証
    await expect(storage.delete({ key: "after-close.bin", signal })).rejects.toThrow(TypeError);
  });

  test("close 後の clear は TypeError で拒否される", async ({ expect, signal, storage }) => {
    // 準備
    storage.close();

    // 実行と検証
    await expect(storage.clear({ signal })).rejects.toThrow(TypeError);
  });

  test("close 後の getWritable は同期エラーになる", ({ expect, signal, storage }) => {
    // 準備
    storage.close();

    // 実行と検証
    expect(() => storage.getWritable({ key: "after-close.bin", signal, vars: {} })).toThrow(
      TypeError,
    );
  });

  test("close 後の getReadable は同期エラーになる", ({ expect, signal, storage }) => {
    // 準備
    storage.close();

    // 実行と検証
    expect(() => storage.getReadable({ key: "after-close.bin", signal })).toThrow(TypeError);
  });

  test("clear した後に close と open をしてもデータは戻らない", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "cleared.bin";
    await storage.write({ key, data: new Uint8Array([1]), signal, vars: {} });
    await storage.clear({ signal });

    // 実行
    storage.close();
    await storage.open();

    // 検証
    await expect(storage.exists({ key, signal })).resolves.toBe(false);
  });
});
