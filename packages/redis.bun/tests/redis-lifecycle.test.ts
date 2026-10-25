import type { IStorage } from "@unikvs/core";
import {
  createGetContext,
  createHasContext,
  createSetContext,
  createOpenContext,
  createClearContext,
  createCloseContext,
  createDeleteContext,
  createStreamContext,
} from "@unikvs/testing";
import { describe } from "vite-plus/test";

import Redis from "../src/redis.js";
import { test, createStorage } from "./_helpers.js";

describe("ライフサイクル管理", () => {
  test("open を 2 回呼び出しても isOpen は true のままで操作できる", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備：
    const key = "double-open.txt";
    const data = new TextEncoder().encode("double open");

    // 実行：
    await storage.open(createOpenContext() as IStorage.OpenContext);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

    // 検証：
    expect(storage.isOpen).toBe(true);
    await expect(
      storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).resolves.toStrictEqual(data);
  });

  test("close を呼び出すと、isOpen が false に戻る", ({ expect, storage }) => {
    // 実行：
    storage.close(createCloseContext() as IStorage.CloseContext);

    // 検証：
    expect(storage.isOpen).toBe(false);
  });

  test("close を 2 回呼び出すと 2 回目は TypeError になる", ({ expect, storage }) => {
    // 準備：
    storage.close(createCloseContext() as IStorage.CloseContext);

    // 実行と検証：
    expect(() => {
      storage.close(createCloseContext() as IStorage.CloseContext);
    }).toThrow(TypeError);
  });

  test("close 後に open し直しても同じインスタンスでデータを読み取れる", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備：
    const key = "reopen-same-instance.bin";
    const data = new Uint8Array([9, 8, 7, 6]);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

    // 実行：
    storage.close(createCloseContext() as IStorage.CloseContext);
    await storage.open(createOpenContext() as IStorage.OpenContext);

    // 検証：
    expect(storage.isOpen).toBe(true);
    await expect(
      storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).resolves.toStrictEqual(data);
  });

  test("別インスタンスから同じプレフィックスのデータを読み取れる", async ({
    url,
    expect,
    signal,
    storage,
    keyPrefix,
  }) => {
    // 準備：
    const key = "shared-prefix.bin";
    const data = new Uint8Array([1, 3, 5, 7]);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

    const other = createStorage(url, keyPrefix);
    await other.open(createOpenContext() as IStorage.OpenContext);

    try {
      // 実行：
      const result = await other.read(createGetContext(key, { signal }) as IStorage.ReadContext);

      // 検証：
      expect(result).toStrictEqual(data);
    } finally {
      other.close(createCloseContext() as IStorage.CloseContext);
    }
  });

  test("プレフィックスが異なるインスタンスは同じキーを共有しない", async ({
    url,
    expect,
    signal,
    storage,
  }) => {
    // 準備：
    const key = "isolated.bin";
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    const other = createStorage(url, "unikvs-other:");
    await other.open(createOpenContext() as IStorage.OpenContext);

    try {
      // 実行と検証：
      await expect(
        other.exists(createHasContext(key, { signal }) as IStorage.ExistsContext),
      ).resolves.toBe(false);
    } finally {
      other.close(createCloseContext() as IStorage.CloseContext);
    }
  });

  test("接続に失敗したとき、open は拒否され isOpen は false のままである", async ({
    expect,
    keyPrefix,
  }) => {
    // 準備：
    // 待機時間を抑えるため、応答しないポートと再試行なしの設定を使用する。
    const unreachable = new Redis("redis://127.0.0.1:1", {
      keyPrefix,
      maxRetries: 0,
      autoReconnect: false,
      connectionTimeout: 1000,
    });

    // 実行と検証：
    await expect(unreachable.open(createOpenContext() as IStorage.OpenContext)).rejects.toThrow();
    expect(unreachable.isOpen).toBe(false);
  });

  test("close 後の write は TypeError で拒否される", async ({ expect, signal, storage }) => {
    // 準備：
    storage.close(createCloseContext() as IStorage.CloseContext);

    // 実行と検証：
    await expect(
      storage.write(
        createSetContext("after-close.bin", { signal }) as IStorage.WriteContext,
        new Uint8Array([1]),
      ),
    ).rejects.toThrow(TypeError);
  });

  test("close 後の read は TypeError で拒否される", async ({ expect, signal, storage }) => {
    // 準備：
    storage.close(createCloseContext() as IStorage.CloseContext);

    // 実行と検証：
    await expect(
      storage.read(createGetContext("after-close.bin", { signal }) as IStorage.ReadContext),
    ).rejects.toThrow(TypeError);
  });

  test("close 後の exists は TypeError で拒否される", async ({ expect, signal, storage }) => {
    // 準備：
    storage.close(createCloseContext() as IStorage.CloseContext);

    // 実行と検証：
    await expect(
      storage.exists(createHasContext("after-close.bin", { signal }) as IStorage.ExistsContext),
    ).rejects.toThrow(TypeError);
  });

  test("close 後の delete は TypeError で拒否される", async ({ expect, signal, storage }) => {
    // 準備：
    storage.close(createCloseContext() as IStorage.CloseContext);

    // 実行と検証：
    await expect(
      storage.delete(createDeleteContext("after-close.bin", { signal }) as IStorage.DeleteContext),
    ).rejects.toThrow(TypeError);
  });

  test("close 後の clear は TypeError で拒否される", async ({ expect, signal, storage }) => {
    // 準備：
    storage.close(createCloseContext() as IStorage.CloseContext);

    // 実行と検証：
    await expect(
      storage.clear(createClearContext("", { signal }) as IStorage.ClearContext),
    ).rejects.toThrow(TypeError);
  });

  test("close 後の getWritable は同期エラーになる", ({ expect, signal, storage }) => {
    // 準備：
    storage.close(createCloseContext() as IStorage.CloseContext);

    // 実行と検証：
    expect(() =>
      storage.getWritable(
        createSetContext("after-close.bin", { signal }) as IStorage.GetWritableContext,
      ),
    ).toThrow(TypeError);
  });

  test("close 後の getReadable は同期エラーになる", ({ expect, signal, storage }) => {
    // 準備：
    storage.close(createCloseContext() as IStorage.CloseContext);

    // 実行と検証：
    expect(() =>
      storage.getReadable(
        createStreamContext("after-close.bin", { signal }) as IStorage.GetReadableContext,
      ),
    ).toThrow(TypeError);
  });

  test("clear した後に close と open をしてもデータは戻らない", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備：
    const key = "cleared.bin";
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

    // 実行：
    storage.close(createCloseContext() as IStorage.CloseContext);
    await storage.open(createOpenContext() as IStorage.OpenContext);

    // 検証：
    await expect(
      storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext),
    ).resolves.toBe(false);
  });
});
