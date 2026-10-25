import { type Server, type Socket, createServer } from "node:net";

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
import { acquireFreePort } from "@unikvs/testing/node";
import { Redis as Ioredis } from "ioredis";
import { vi, afterAll, describe, beforeAll } from "vite-plus/test";

import { ConnectTimeoutError } from "../src/errors.js";
import Valkey from "../src/valkey.js";
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

  test("注入されたクライアントは open でも close でも接続・切断されない", async ({
    fake,
    expect,
    storage,
  }) => {
    // 実行：
    await storage.close(createCloseContext() as IStorage.CloseContext);

    // 検証：
    // 所有権は呼び出し側にあるため、接続も切断も行わない。
    expect(storage.isOpen).toBe(false);
    expect(fake.connectCalls).toBe(0);
    expect(fake.quitCalls).toBe(0);
    expect(fake.disconnectCalls).toBe(0);
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
    fake,
    expect,
    signal,
    storage,
    keyPrefix,
  }) => {
    // 準備：
    const key = "shared-prefix.bin";
    const data = new Uint8Array([1, 3, 5, 7]);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

    const other = createStorage(fake, keyPrefix);
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
    fake,
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

    const other = createStorage(fake, "unikvs-other:");
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
    const port = await acquireFreePort();
    const unreachable = new Valkey(`redis://127.0.0.1:${port}`, {
      keyPrefix,
      connectTimeout: 1000,
    });

    // 実行と検証：
    await expect(unreachable.open(createOpenContext() as IStorage.OpenContext)).rejects.toThrow();
    expect(unreachable.isOpen).toBe(false);
  });

  test("VALKEY_URL が指定されたとき、環境変数の接続先で open を試みる", async ({
    expect,
    keyPrefix,
  }) => {
    // 準備：
    // `url` 引数を省略し、到達不能な接続先を環境変数で渡して `VALKEY_URL` が使われることを確認する。
    const port = await acquireFreePort();
    const prevValkeyUrl = process.env["VALKEY_URL"];
    const prevRedisUrl = process.env["REDIS_URL"];
    process.env["VALKEY_URL"] = `redis://127.0.0.1:${port}`;

    delete process.env["REDIS_URL"];
    const fromEnv = new Valkey(undefined, {
      keyPrefix,
      connectTimeout: 1000,
    });

    try {
      // 実行と検証：
      await expect(fromEnv.open(createOpenContext() as IStorage.OpenContext)).rejects.toThrow();
      expect(fromEnv.isOpen).toBe(false);
    } finally {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- ポーリング／後始末の条件分岐はテストの進行に必須のため、使用します。
      if (prevValkeyUrl === undefined) {
        delete process.env["VALKEY_URL"];
      } else {
        process.env["VALKEY_URL"] = prevValkeyUrl;
      }

      // oxlint-disable-next-line vitest/no-conditional-in-test -- ポーリング／後始末の条件分岐はテストの進行に必須のため、使用します。
      if (prevRedisUrl === undefined) {
        delete process.env["REDIS_URL"];
      } else {
        process.env["REDIS_URL"] = prevRedisUrl;
      }
    }
  });

  test("url も環境変数もないとき、オプションの接続先で open を試みる", async ({
    expect,
    keyPrefix,
  }) => {
    // 準備：
    // `url` を使わず、`RedisOptions` の host / port が ioredis へ透過することを確認する。
    const port = await acquireFreePort();
    const prevValkeyUrl = process.env["VALKEY_URL"];
    const prevRedisUrl = process.env["REDIS_URL"];

    delete process.env["VALKEY_URL"];
    delete process.env["REDIS_URL"];
    const byOptions = new Valkey(undefined, {
      host: "127.0.0.1",
      port,
      keyPrefix,
      connectTimeout: 1000,
    });

    try {
      // 実行と検証：
      await expect(byOptions.open(createOpenContext() as IStorage.OpenContext)).rejects.toThrow();
      expect(byOptions.isOpen).toBe(false);
    } finally {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- ポーリング／後始末の条件分岐はテストの進行に必須のため、使用します。
      if (prevValkeyUrl === undefined) {
        delete process.env["VALKEY_URL"];
      } else {
        process.env["VALKEY_URL"] = prevValkeyUrl;
      }

      // oxlint-disable-next-line vitest/no-conditional-in-test -- ポーリング／後始末の条件分岐はテストの進行に必須のため、使用します。
      if (prevRedisUrl === undefined) {
        delete process.env["REDIS_URL"];
      } else {
        process.env["REDIS_URL"] = prevRedisUrl;
      }
    }
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

describe("接続タイムアウト", () => {
  let port = 0;
  let server: Server | undefined;
  const sockets = new Set<Socket>();
  beforeAll(async () => {
    // 応答しないホストを再現する。接続は受け付けるが何も返さない。
    port = await acquireFreePort();
    server = createServer((socket) => {
      sockets.add(socket);
      socket.on("error", () => {});
      socket.on("close", () => {
        sockets.delete(socket);
      });
    });

    await new Promise<void>((resolve) => {
      if (server === undefined) {
        resolve();

        return;
      }

      server.listen(port, "127.0.0.1", resolve);
    });
  });
  afterAll(async () => {
    // 受け付けた接続を残したままでは `close` が完了しないため、先に破棄する。
    for (const socket of sockets) {
      socket.destroy();
    }

    sockets.clear();

    await new Promise<void>((resolve) => {
      if (server === undefined) {
        resolve();

        return;
      }

      server.close(() => {
        resolve();
      });
    });
  });
  test("応答しないホストのとき、open は connectTimeout で打ち切られる", async ({
    expect,
    keyPrefix,
  }) => {
    // 準備：
    // タイムアウト発動の場合を検証する。
    // `Promise.race` による打ち切りであることを確認する。
    const silent = new Valkey(`redis://127.0.0.1:${port}`, {
      keyPrefix,
      connectTimeout: 500,
    });

    // 実行と検証：
    const start = Date.now();
    await expect(silent.open(createOpenContext() as IStorage.OpenContext)).rejects.toThrow(
      ConnectTimeoutError,
    );
    expect(Date.now() - start).toBeLessThan(10e3);
    expect(silent.isOpen).toBe(false);
  });
});

describe("切断タイムアウト", () => {
  test("quit が応答しないとき、close は closeTimeout で復帰し disconnect する", async ({
    expect,
    keyPrefix,
  }) => {
    // 準備：
    // 接続確立は成功したものとし、`quit` だけをハングさせて打ち切り経路を通す。
    const connect = vi.spyOn(Ioredis.prototype, "connect").mockResolvedValue();
    const quit = vi
      .spyOn(Ioredis.prototype, "quit")
      .mockImplementation(() => new Promise<never>(() => {}));
    const disconnect = vi.spyOn(Ioredis.prototype, "disconnect");
    const storage = new Valkey("redis://127.0.0.1:1", {
      keyPrefix,
      closeTimeout: 100,
    });

    try {
      await storage.open(createOpenContext() as IStorage.OpenContext);

      // 実行：
      const start = Date.now();

      await storage.close(createCloseContext() as IStorage.CloseContext);

      // 検証：
      expect(Date.now() - start).toBeLessThan(10e3);
      expect(connect).toHaveBeenCalled();
      expect(quit).toHaveBeenCalled();
      expect(disconnect).toHaveBeenCalled();
      expect(storage.isOpen).toBe(false);
    } finally {
      vi.restoreAllMocks();
    }
  });
});

// 並行 `open` 同士・`open` 接続待ち中の `close` の同時呼び出しは検証しない。
// 同時呼び出しは禁止 (事前条件) とする。
// 並行 `close` 同士は一方が `TypeError` reject する定義通りの振る舞いになる。
// 上記は禁止範囲に含めない。
