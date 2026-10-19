import type { IStorage } from "@unikvs/core";
import {
  createClearContext,
  createCloseContext,
  createDeleteContext,
  createGetContext,
  createHasContext,
  createOpenContext,
  createSetContext,
} from "@unikvs/testing";
import { describe } from "vitest";

import { ConnectTimeoutError } from "../src/errors.js";
import Memcached, { type MemcachedClientLike } from "../src/memcached.js";
import { createStorage, FakeMemcachedClient, test } from "./_helpers.js";

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
    await storage.open(createOpenContext() as IStorage.OpenContext);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

    // 検証
    expect(storage.isOpen).toBe(true);
    await expect(
      storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).resolves.toStrictEqual(data);
  });

  test("close を呼び出すと、isOpen が false に戻る", async ({ expect, storage }) => {
    // 実行
    await storage.close(createCloseContext() as IStorage.CloseContext);

    // 検証
    expect(storage.isOpen).toBe(false);
  });

  test("close を呼び出すと、クライアントが解放される", async ({ client, expect, storage }) => {
    // 実行
    await storage.close(createCloseContext() as IStorage.CloseContext);

    // 検証
    expect(client.quitCalls).toBe(1);
  });

  test("quit のないクライアントは close で閉じられる", async ({ expect, keyPrefix }) => {
    // 準備
    let closeCalls = 0;
    const client: MemcachedClientLike = {
      get: async () => ({ value: null }),
      set: async () => true,
      delete: async () => true,
      flush: async () => true,
      close: () => {
        closeCalls += 1;
      },
    };
    const storage = new Memcached(undefined, { client, keyPrefix });
    await storage.open(createOpenContext() as IStorage.OpenContext);

    // 実行
    await storage.close(createCloseContext() as IStorage.CloseContext);

    // 検証
    expect(closeCalls).toBe(1);
  });

  test("close を 2 回呼び出すと 2 回目は TypeError で拒否される", async ({ expect, storage }) => {
    // 準備
    await storage.close(createCloseContext() as IStorage.CloseContext);

    // 実行と検証
    await expect(storage.close(createCloseContext() as IStorage.CloseContext)).rejects.toThrow(
      TypeError,
    );
  });

  test("close 後に open し直しても同じインスタンスでデータを読み取れる", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "reopen-same-instance.bin";
    const data = new Uint8Array([9, 8, 7, 6]);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

    // 実行
    await storage.close(createCloseContext() as IStorage.CloseContext);
    await storage.open(createOpenContext() as IStorage.OpenContext);

    // 検証
    expect(storage.isOpen).toBe(true);
    await expect(
      storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).resolves.toStrictEqual(data);
  });

  test("別インスタンスから同じプレフィックスのデータを読み取れる", async ({
    client,
    expect,
    keyPrefix,
    signal,
    storage,
  }) => {
    // 準備
    const key = "shared-prefix.bin";
    const data = new Uint8Array([1, 3, 5, 7]);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

    const other = createStorage(client, keyPrefix);
    await other.open(createOpenContext() as IStorage.OpenContext);

    try {
      // 実行
      const result = await other.read(createGetContext(key, { signal }) as IStorage.ReadContext);

      // 検証
      expect(result).toStrictEqual(data);
    } finally {
      await other.close(createCloseContext() as IStorage.CloseContext);
    }
  });

  test("接続に失敗したとき、open は拒否され isOpen は false のままである", async ({
    expect,
    keyPrefix,
  }) => {
    // 準備
    // 到達不能ポートへの接続は即時失敗 (ECONNREFUSED) します。
    // 実サーバー不要で `memjs` 経路の失敗を検証します。
    const unreachable = new Memcached("127.0.0.1:1", { keyPrefix });

    // 実行と検証
    await expect(unreachable.open(createOpenContext() as IStorage.OpenContext)).rejects.toThrow();
    expect(unreachable.isOpen).toBe(false);
  });

  test("servers を配列と host/port でも指定できる", async ({ expect, keyPrefix }) => {
    // 準備
    const fromArray = new Memcached(["127.0.0.1:1"], { keyPrefix });
    const fromHostPort = new Memcached(undefined, { host: "127.0.0.1", port: 1, keyPrefix });

    // 実行と検証
    await expect(fromArray.open(createOpenContext() as IStorage.OpenContext)).rejects.toThrow();
    expect(fromArray.isOpen).toBe(false);
    await expect(fromHostPort.open(createOpenContext() as IStorage.OpenContext)).rejects.toThrow();
    expect(fromHostPort.isOpen).toBe(false);
  });

  test("応答しないクライアントのとき、open は connectTimeout で打ち切られる", async ({
    expect,
    keyPrefix,
  }) => {
    // 準備
    // 応答しない偽クライアントでタイムアウト発動を確定的に検証します。
    const hanging: MemcachedClientLike = {
      get: () => new Promise(() => {}),
      set: async () => true,
      delete: async () => true,
      flush: async () => true,
    };
    const silent = new Memcached(undefined, {
      client: hanging,
      connectTimeout: 50,
      keyPrefix,
    });

    // 実行と検証
    const start = Date.now();
    await expect(silent.open(createOpenContext() as IStorage.OpenContext)).rejects.toThrow(
      ConnectTimeoutError,
    );
    expect(Date.now() - start).toBeLessThan(10e3);
    expect(silent.isOpen).toBe(false);
  });

  test("open に失敗しても注入クライアントは解放されない", async ({ expect, keyPrefix }) => {
    // 準備
    let quitCalls = 0;
    const hanging: MemcachedClientLike = {
      get: () => new Promise(() => {}),
      set: async () => true,
      delete: async () => true,
      flush: async () => true,
      quit: () => {
        quitCalls += 1;
      },
    };
    const silent = new Memcached(undefined, {
      client: hanging,
      connectTimeout: 50,
      keyPrefix,
    });

    // 実行
    await expect(silent.open(createOpenContext() as IStorage.OpenContext)).rejects.toThrow(
      ConnectTimeoutError,
    );

    // 検証
    expect(quitCalls).toBe(0);
  });

  test("close 後の write は TypeError で拒否される", async ({ expect, signal, storage }) => {
    // 準備
    await storage.close(createCloseContext() as IStorage.CloseContext);

    // 実行と検証
    await expect(
      storage.write(
        createSetContext("after-close.bin", { signal }) as IStorage.WriteContext,
        new Uint8Array([1]),
      ),
    ).rejects.toThrow(TypeError);
  });

  test("close 後の read は TypeError で拒否される", async ({ expect, signal, storage }) => {
    // 準備
    await storage.close(createCloseContext() as IStorage.CloseContext);

    // 実行と検証
    await expect(
      storage.read(createGetContext("after-close.bin", { signal }) as IStorage.ReadContext),
    ).rejects.toThrow(TypeError);
  });

  test("close 後の exists は TypeError で拒否される", async ({ expect, signal, storage }) => {
    // 準備
    await storage.close(createCloseContext() as IStorage.CloseContext);

    // 実行と検証
    await expect(
      storage.exists(createHasContext("after-close.bin", { signal }) as IStorage.ExistsContext),
    ).rejects.toThrow(TypeError);
  });

  test("close 後の delete は TypeError で拒否される", async ({ expect, signal, storage }) => {
    // 準備
    await storage.close(createCloseContext() as IStorage.CloseContext);

    // 実行と検証
    await expect(
      storage.delete(createDeleteContext("after-close.bin", { signal }) as IStorage.DeleteContext),
    ).rejects.toThrow(TypeError);
  });

  test("close 後の clear は TypeError で拒否される", async ({ expect, signal, storage }) => {
    // 準備
    await storage.close(createCloseContext() as IStorage.CloseContext);

    // 実行と検証
    await expect(
      storage.clear(createClearContext("", { signal }) as IStorage.ClearContext),
    ).rejects.toThrow(TypeError);
  });

  test("clear した後に close と open をしてもデータは戻らない", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "cleared.bin";
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

    // 実行
    await storage.close(createCloseContext() as IStorage.CloseContext);
    await storage.open(createOpenContext() as IStorage.OpenContext);

    // 検証
    await expect(
      storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext),
    ).resolves.toBe(false);
  });

  test("open 前の write は TypeError で拒否される", async ({ expect }) => {
    // 準備
    const unopened = new Memcached(undefined, {
      client: new FakeMemcachedClient(),
      keyPrefix: "unikvs-test-unopened:",
    });
    const signal = new AbortController().signal;

    // 実行と検証
    // 未 `open` の判定が中断検証より先に行われます。
    await expect(
      unopened.write(
        createSetContext("unopened.bin", { signal }) as IStorage.WriteContext,
        new Uint8Array([1]),
      ),
    ).rejects.toThrow(TypeError);
  });
});

// 並行 `open` 同士・`open` 接続待ち中の `close` の同時呼び出しは検証しない。
// 同時呼び出しは禁止 (事前条件) とする。
// 並行 `close` 同士は一方が `TypeError` reject する定義通りの振る舞いになる。
// 上記は禁止範囲に含めない。
