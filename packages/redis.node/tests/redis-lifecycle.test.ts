import type { IStorage } from "@unikvs/core";
import {
  collectBytes,
  createGetContext,
  createHasContext,
  createSetContext,
  createOpenContext,
  createClearContext,
  createCloseContext,
  createDeleteContext,
  createStreamContext,
} from "@unikvs/testing";
import { Redis as Ioredis } from "ioredis";
import { vi, describe } from "vite-plus/test";

import { ConnectTimeoutError } from "../src/errors.js";
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

  test("close を呼び出すと、isOpen が false に戻る", async ({ expect, storage }) => {
    // 実行：
    await storage.close(createCloseContext() as IStorage.CloseContext);

    // 検証：
    expect(storage.isOpen).toBe(false);
  });

  test("close を 2 回呼び出すと 2 回目は TypeError で拒否される", async ({ expect, storage }) => {
    // 準備：
    await storage.close(createCloseContext() as IStorage.CloseContext);

    // 実行と検証：
    await expect(storage.close(createCloseContext() as IStorage.CloseContext)).rejects.toThrow(
      TypeError,
    );
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
    await storage.close(createCloseContext() as IStorage.CloseContext);
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
      await other.close(createCloseContext() as IStorage.CloseContext);
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
      await other.close(createCloseContext() as IStorage.CloseContext);
    }
  });

  test("接続に失敗したとき、open は拒否され isOpen は false のままである", async ({
    expect,
    keyPrefix,
  }) => {
    // 準備：
    // 即時失敗 (ECONNREFUSED) を検証する。
    // 実装前スモークで確定した `ioredis` 用の到達不能セットを使用する。
    const unreachable = new Redis("redis://127.0.0.1:1", {
      keyPrefix,
      connectTimeout: 1000,
    });

    // 実行と検証：
    await expect(unreachable.open(createOpenContext() as IStorage.OpenContext)).rejects.toThrow();
    expect(unreachable.isOpen).toBe(false);
  });

  test("応答しないホストのとき、open は connectTimeout で打ち切られる", async ({
    expect,
    keyPrefix,
  }) => {
    // 準備：
    // タイムアウト発動の場合を検証する。
    // `Promise.race` による打ち切りであることを確認する。
    const silent = new Redis("redis://192.0.2.1:6379", {
      keyPrefix,
      connectTimeout: 1000,
    });

    // 実行と検証：
    const start = Date.now();
    await expect(silent.open(createOpenContext() as IStorage.OpenContext)).rejects.toThrow(
      ConnectTimeoutError,
    );
    expect(Date.now() - start).toBeLessThan(10e3);
    expect(silent.isOpen).toBe(false);
  });

  test("close 後の write は TypeError で拒否される", async ({ expect, signal, storage }) => {
    // 準備：
    await storage.close(createCloseContext() as IStorage.CloseContext);

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
    await storage.close(createCloseContext() as IStorage.CloseContext);

    // 実行と検証：
    await expect(
      storage.read(createGetContext("after-close.bin", { signal }) as IStorage.ReadContext),
    ).rejects.toThrow(TypeError);
  });

  test("close 後の exists は TypeError で拒否される", async ({ expect, signal, storage }) => {
    // 準備：
    await storage.close(createCloseContext() as IStorage.CloseContext);

    // 実行と検証：
    await expect(
      storage.exists(createHasContext("after-close.bin", { signal }) as IStorage.ExistsContext),
    ).rejects.toThrow(TypeError);
  });

  test("close 後の delete は TypeError で拒否される", async ({ expect, signal, storage }) => {
    // 準備：
    await storage.close(createCloseContext() as IStorage.CloseContext);

    // 実行と検証：
    await expect(
      storage.delete(createDeleteContext("after-close.bin", { signal }) as IStorage.DeleteContext),
    ).rejects.toThrow(TypeError);
  });

  test("close 後の clear は TypeError で拒否される", async ({ expect, signal, storage }) => {
    // 準備：
    await storage.close(createCloseContext() as IStorage.CloseContext);

    // 実行と検証：
    await expect(
      storage.clear(createClearContext("", { signal }) as IStorage.ClearContext),
    ).rejects.toThrow(TypeError);
  });

  test("close 後の getWritable は同期エラーになる", async ({ expect, signal, storage }) => {
    // 準備：
    await storage.close(createCloseContext() as IStorage.CloseContext);

    // 実行と検証：
    expect(() =>
      storage.getWritable(
        createSetContext("after-close.bin", { signal }) as IStorage.GetWritableContext,
      ),
    ).toThrow(TypeError);
  });

  test("close 後の getReadable は同期エラーになる", async ({ expect, signal, storage }) => {
    // 準備：
    await storage.close(createCloseContext() as IStorage.CloseContext);

    // 実行と検証：
    expect(() =>
      storage.getReadable(
        createStreamContext("after-close.bin", { signal }) as IStorage.GetReadableContext,
      ),
    ).toThrow(TypeError);
  });

  test("getReadable 取得後に close しても、取得時のクライアントで読み取れる", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備：
    const key = "readable-after-close.bin";
    const expected = new Uint8Array([4, 5, 6]);
    // close 済みでも応答するよう取得だけをスタブ化します。
    // 接続を再解決すると TypeError になるため、取得時のクライアントが使われたことを確認できます。
    const getBufferSpy = vi
      .spyOn(Ioredis.prototype, "getBuffer")
      .mockResolvedValue(Buffer.from(expected));
    const readable = storage.getReadable(
      createStreamContext(key, { signal }) as IStorage.GetReadableContext,
    );

    try {
      // 実行：
      await storage.close(createCloseContext() as IStorage.CloseContext);
      const result = await collectBytes(readable);

      // 検証：
      expect(getBufferSpy).toHaveBeenCalledTimes(1);
      expect(result).toStrictEqual(expected);
    } finally {
      vi.restoreAllMocks();
    }
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
    await storage.close(createCloseContext() as IStorage.CloseContext);
    await storage.open(createOpenContext() as IStorage.OpenContext);

    // 検証：
    await expect(
      storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext),
    ).resolves.toBe(false);
  });
});

// 並行 `open` 同士・`open` 接続待ち中の `close` の同時呼び出しは検証しない。
// 同時呼び出しは禁止 (事前条件) とする。
// 並行 `close` 同士は一方が `TypeError` reject する定義通りの振る舞いになる。
// 上記は禁止範囲に含めない。
