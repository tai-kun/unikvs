import type { IStorage } from "@unikvs/core";
import {
  createClearContext,
  createCloseContext,
  createDeleteContext,
  createOpenContext,
} from "@unikvs/testing";
import { describe, test } from "vitest";

import {
  ConnectTimeoutError,
  InvalidConnectTimeoutError,
  InvalidTtlSecondsError,
  KeyNotFoundError,
} from "../src/errors.js";
import Memcached, { type MemcachedClientLike } from "../src/memcached.js";
import { FakeMemcachedClient } from "./_helpers.js";

describe("KeyNotFoundError", () => {
  test("name は UniKvsKeyNotFoundError である", ({ expect }) => {
    // 準備と実行
    const error = new KeyNotFoundError({ key: "k1" });

    // 検証
    expect(error.name).toBe("UniKvsKeyNotFoundError");
  });

  test("meta と一度だけ整形されたメッセージを保持する", ({ expect }) => {
    // 準備と実行
    const error = new KeyNotFoundError({ key: "k1" });

    // 検証
    expect(error.meta).toStrictEqual({ key: "k1" });
    expect(error.message).toBe("Key not found: k1");
  });
});

describe("InvalidTtlSecondsError", () => {
  test("name は MemcachedInvalidTtlSecondsError である", ({ expect }) => {
    // 準備と実行
    const error = new InvalidTtlSecondsError({ actual: -1 });

    // 検証
    expect(error.name).toBe("MemcachedInvalidTtlSecondsError");
  });

  test("meta と一度だけ整形されたメッセージを保持する", ({ expect }) => {
    // 準備と実行
    const error = new InvalidTtlSecondsError({ actual: -1 });

    // 検証
    expect(error.meta).toStrictEqual({ actual: -1 });
    expect(error.message).toContain("`ttlSeconds` must be a finite number");
  });

  test("ttlSeconds に不正値を指定するとコンストラクターが拒否する", ({ expect }) => {
    // 実行と検証
    for (const ttlSeconds of [-1, Number.NaN, Number.POSITIVE_INFINITY, "60"]) {
      expect(
        () =>
          new Memcached(undefined, {
            client: new FakeMemcachedClient(),
            ttlSeconds: ttlSeconds as number,
          }),
        `ttlSeconds: ${String(ttlSeconds)}`,
      ).toThrow(InvalidTtlSecondsError);
    }
  });
});

describe("InvalidConnectTimeoutError", () => {
  test("name は MemcachedInvalidConnectTimeoutError である", ({ expect }) => {
    // 準備と実行
    const error = new InvalidConnectTimeoutError({ actual: 0 });

    // 検証
    expect(error.name).toBe("MemcachedInvalidConnectTimeoutError");
  });

  test("meta と一度だけ整形されたメッセージを保持する", ({ expect }) => {
    // 準備と実行
    const error = new InvalidConnectTimeoutError({ actual: 0 });

    // 検証
    expect(error.meta).toStrictEqual({ actual: 0 });
    expect(error.message).toContain("`connectTimeout` must be a finite positive number");
  });

  test("connectTimeout に不正値を指定するとコンストラクターが拒否する", ({ expect }) => {
    // 実行と検証
    for (const connectTimeout of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        () =>
          new Memcached(undefined, {
            client: new FakeMemcachedClient(),
            connectTimeout,
          }),
        `connectTimeout: ${String(connectTimeout)}`,
      ).toThrow(InvalidConnectTimeoutError);
    }
  });
});

describe("非互換クライアント", () => {
  test("delete も del もないクライアントの delete は TypeError で拒否される", async ({
    expect,
  }) => {
    // 準備
    const storage = new Memcached(undefined, {
      client: {
        get: async () => ({ value: null }),
        set: async () => true,
        flush: async () => true,
        quit: () => {},
      } as unknown as MemcachedClientLike,
      keyPrefix: "unikvs-test-incompatible:",
    });
    await storage.open(createOpenContext() as IStorage.OpenContext);

    try {
      // 実行と検証
      await expect(
        storage.delete(
          createDeleteContext("incompatible.bin", {
            signal: new AbortController().signal,
          }) as IStorage.DeleteContext,
        ),
      ).rejects.toThrow(TypeError);
    } finally {
      await storage.close(createCloseContext() as IStorage.CloseContext);
    }
  });

  test("flush も flushAll もないクライアントの clear は TypeError で拒否される", async ({
    expect,
  }) => {
    // 準備
    const storage = new Memcached(undefined, {
      client: {
        get: async () => ({ value: null }),
        set: async () => true,
        delete: async () => true,
        quit: () => {},
      } as unknown as MemcachedClientLike,
      keyPrefix: "unikvs-test-incompatible:",
    });
    await storage.open(createOpenContext() as IStorage.OpenContext);

    try {
      // 実行と検証
      await expect(
        storage.clear(
          createClearContext("", {
            signal: new AbortController().signal,
          }) as IStorage.ClearContext,
        ),
      ).rejects.toThrow(TypeError);
    } finally {
      await storage.close(createCloseContext() as IStorage.CloseContext);
    }
  });
});

describe("ConnectTimeoutError", () => {
  test("name は MemcachedConnectTimeoutError である", ({ expect }) => {
    // 準備と実行
    const error = new ConnectTimeoutError({ timeoutMs: 1000 });

    // 検証
    expect(error.name).toBe("MemcachedConnectTimeoutError");
  });

  test("meta と一度だけ整形されたメッセージを保持する", ({ expect }) => {
    // 準備と実行
    const error = new ConnectTimeoutError({ timeoutMs: 1000 });

    // 検証
    expect(error.meta).toStrictEqual({ timeoutMs: 1000 });
    expect(error.message).toBe("Timed out connecting to Memcached after 1000ms");
  });
});
