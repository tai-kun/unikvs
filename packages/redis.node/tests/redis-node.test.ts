import { spawn } from "node:child_process";

import type { IStorage } from "@unikvs/core";
import {
  createGetContext,
  createHasContext,
  createSetContext,
  createOpenContext,
  createCloseContext,
} from "@unikvs/testing";
import { waitForPort } from "@unikvs/testing/node";
import { Redis as Ioredis } from "ioredis";
import { vi, describe, afterEach, expectTypeOf } from "vite-plus/test";

import { ClusterNotSupportedError, InvalidCloseTimeoutError } from "../src/errors.js";
import Redis, { type RedisStorageOptions } from "../src/redis.js";
import { test } from "./_helpers.js";

describe("Node 固有の振る舞い", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  test("url が REDIS_URL・VALKEY_URL より優先される", async ({ url, expect, signal }) => {
    // 準備：
    vi.stubEnv("REDIS_URL", "redis://127.0.0.1:1");
    vi.stubEnv("VALKEY_URL", "redis://127.0.0.1:1");
    const storage = new Redis(url, { keyPrefix: `env-priority-${crypto.randomUUID()}:` });

    // 実行：
    await storage.open(createOpenContext() as IStorage.OpenContext);

    try {
      // 検証：
      expect(storage.isOpen).toBe(true);
      await storage.write(
        createSetContext("a", { signal }) as IStorage.WriteContext,
        new Uint8Array([1]),
      );
      await expect(
        storage.read(createGetContext("a", { signal }) as IStorage.ReadContext),
      ).resolves.toStrictEqual(new Uint8Array([1]));
    } finally {
      await storage.close(createCloseContext() as IStorage.CloseContext);
    }
  });

  test("url を未指定にしたとき、REDIS_URL から解決する", async ({ url, expect, signal }) => {
    // 準備：
    vi.stubEnv("REDIS_URL", url);
    const storage = new Redis(undefined, { keyPrefix: `env-redis-url-${crypto.randomUUID()}:` });

    // 実行：
    await storage.open(createOpenContext() as IStorage.OpenContext);

    try {
      // 検証：
      expect(storage.isOpen).toBe(true);
      await expect(
        storage.exists(createHasContext("a", { signal }) as IStorage.ExistsContext),
      ).resolves.toBe(false);
    } finally {
      await storage.close(createCloseContext() as IStorage.CloseContext);
    }
  });

  test("REDIS_URL がないとき、VALKEY_URL から解決する", async ({ url, expect, signal }) => {
    // 準備：
    vi.stubEnv("REDIS_URL", "");
    vi.stubEnv("VALKEY_URL", url);
    const storage = new Redis(undefined, { keyPrefix: `env-valkey-url-${crypto.randomUUID()}:` });

    // 実行：
    await storage.open(createOpenContext() as IStorage.OpenContext);

    try {
      // 検証：
      expect(storage.isOpen).toBe(true);
      await expect(
        storage.exists(createHasContext("a", { signal }) as IStorage.ExistsContext),
      ).resolves.toBe(false);
    } finally {
      await storage.close(createCloseContext() as IStorage.CloseContext);
    }
  });

  test("空文字を指定したとき、未指定扱いで次の候補に進む", async ({ url, expect, signal }) => {
    // 準備：
    vi.stubEnv("REDIS_URL", "");
    vi.stubEnv("VALKEY_URL", url);
    const storage = new Redis("", { keyPrefix: `env-empty-${crypto.randomUUID()}:` });

    // 実行：
    await storage.open(createOpenContext() as IStorage.OpenContext);

    try {
      // 検証：
      expect(storage.isOpen).toBe(true);
      await expect(
        storage.exists(createHasContext("a", { signal }) as IStorage.ExistsContext),
      ).resolves.toBe(false);
    } finally {
      await storage.close(createCloseContext() as IStorage.CloseContext);
    }
  });

  test("url も環境変数もないとき、127.0.0.1:6379 に接続する", async ({ expect, signal }) => {
    // 準備：
    // 既定ポートに専用サーバーを起動し、解決先が既定値であることを確認できるようにする。
    const fixed = spawn(
      "redis-server",
      ["--port", "6379", "--bind", "127.0.0.1", "--save", "", "--appendonly", "no"],
      { stdio: "ignore" },
    );

    await waitForPort(6379);
    vi.stubEnv("REDIS_URL", "");
    vi.stubEnv("VALKEY_URL", "");
    const storage = new Redis(undefined, { keyPrefix: `env-default-${crypto.randomUUID()}:` });

    try {
      // 実行：
      await storage.open(createOpenContext() as IStorage.OpenContext);

      // 検証：
      expect(storage.isOpen).toBe(true);
      await storage.write(
        createSetContext("a", { signal }) as IStorage.WriteContext,
        new Uint8Array([1]),
      );
      await expect(
        storage.read(createGetContext("a", { signal }) as IStorage.ReadContext),
      ).resolves.toStrictEqual(new Uint8Array([1]));
    } finally {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- ポーリング／後始末の条件分岐はテストの進行に必須のため、使用します。
      if (storage.isOpen) {
        await storage.close(createCloseContext() as IStorage.CloseContext);
      }

      // oxlint-disable-next-line vitest/no-conditional-in-test -- ポーリング／後始末の条件分岐はテストの進行に必須のため、使用します。
      if (!fixed.killed) {
        fixed.kill();
      }
    }
  });

  test("到達不能のとき、open は有限時間で拒否されプロセスは落ちない", async ({
    expect,
    keyPrefix,
  }) => {
    // 準備：
    const unreachable = new Redis("redis://127.0.0.1:1", {
      keyPrefix,
      connectTimeout: 500,
    });

    // 実行と検証：
    const start = Date.now();
    await expect(unreachable.open(createOpenContext() as IStorage.OpenContext)).rejects.toThrow();
    expect(Date.now() - start).toBeLessThan(10e3);
    expect(unreachable.isOpen).toBe(false);
  });

  test("quit がハングしたとき、close は closeTimeout で復帰して disconnect する", async ({
    url,
    expect,
    keyPrefix,
  }) => {
    // 準備：
    // V3-S2 の固定手順に従う。
    // プロトタイプへの spy と `restoreAllMocks` による後始末を行う。
    // 単体レベルの検証で済ませる。
    const quitSpy = vi
      .spyOn(Ioredis.prototype, "quit")
      .mockImplementation(() => new Promise<never>(() => {}));
    const disconnectSpy = vi.spyOn(Ioredis.prototype, "disconnect");
    const storage = new Redis(url, {
      keyPrefix,
      closeTimeout: 100,
    });
    await storage.open(createOpenContext() as IStorage.OpenContext);

    try {
      // 実行と検証：
      const start = Date.now();

      await storage.close(createCloseContext() as IStorage.CloseContext);
      expect(Date.now() - start).toBeLessThan(10e3);
      expect(quitSpy).toHaveBeenCalled();
      expect(disconnectSpy).toHaveBeenCalled();
      expect(storage.isOpen).toBe(false);
    } finally {
      vi.restoreAllMocks();
      // oxlint-disable-next-line vitest/no-conditional-in-test -- ポーリング／後始末の条件分岐はテストの進行に必須のため、使用します。
      if (storage.isOpen) {
        await storage.close(createCloseContext() as IStorage.CloseContext);
      }
    }
  });

  test("closeTimeout に不正値を指定したとき、コンストラクタは InvalidCloseTimeoutError で拒否する", ({
    url,
    expect,
    keyPrefix,
  }) => {
    // 準備：
    const invalidValues = [0, -1, Number.NaN, Number.POSITIVE_INFINITY, "100"];

    // 実行と検証：
    for (const closeTimeout of invalidValues) {
      expect(
        () =>
          new Redis(url, {
            keyPrefix,
            closeTimeout: closeTimeout as unknown as number,
          }),
      ).toThrow(InvalidCloseTimeoutError);
      expect(
        () =>
          new Redis(url, {
            keyPrefix,
            closeTimeout: closeTimeout as unknown as number,
          }),
      ).toThrow(/`closeTimeout` must be a finite positive number/u);
    }
    // `undefined` は既定値 5000ms になるため対象外とする。
    expect(
      () =>
        new Redis(url, {
          keyPrefix,
          closeTimeout: undefined,
        }),
    ).not.toThrow();
  });

  test("cluster を指定したとき、standalone 専用のエラーで拒否される", ({
    url,
    expect,
    keyPrefix,
  }) => {
    // 準備：
    const make = (): Redis =>
      new Redis(url, {
        cluster: {
          nodes: [
            {
              host: "127.0.0.1",
              port: 6379,
            },
          ],
        },
        keyPrefix,
      });

    // 実行と検証：
    expect(make).toThrow(ClusterNotSupportedError);
    expect(make).toThrow(/standalone/u);
  });

  test("lazyConnect は型レベルで受け付けられない", () => {
    // 実行と検証：
    // `expect-type` 1.4.0 に `.not.toHaveProperty` があることを確認したため、本形に固定する (V3-N1)。
    expectTypeOf<RedisStorageOptions>().not.toHaveProperty("lazyConnect");
  });

  test("keyPrefix は ioredis 備え付け prefix として二重に付与されない", async ({
    url,
    expect,
    signal,
  }) => {
    // 準備：
    // V3-S1 の固定手順に従う。
    // 主手順は観測可能な振る舞い (一重 prefix) とする。
    // `any` 直参照はしない。
    const key = `d-prime-${crypto.randomUUID()}.bin`;
    const storage = new Redis(url, { keyPrefix: "p:" });
    await storage.open(createOpenContext() as IStorage.OpenContext);

    try {
      // 実行：
      await storage.write(
        createSetContext(key, { signal }) as IStorage.WriteContext,
        new Uint8Array([1]),
      );

      // 検証：
      const raw = new Ioredis(url);

      try {
        const keys = await raw.keys("*");
        expect(keys).toContain(`p:${key}`);
        expect(keys).not.toContain(`p:p:${key}`);
      } finally {
        await raw.quit();
      }
    } finally {
      await storage.close(createCloseContext() as IStorage.CloseContext);
    }
  });

  test("第 2 引数を省略した new Redis(url) でもエラーにならない", async ({
    url,
    expect,
    signal,
  }) => {
    // 準備と実行。
    const storage = new Redis(url);

    // 検証：
    expect(storage.isOpen).toBe(false);
    await storage.open(createOpenContext() as IStorage.OpenContext);

    try {
      expect(storage.isOpen).toBe(true);
      await storage.write(
        createSetContext("omitted-options.bin", { signal }) as IStorage.WriteContext,
        new Uint8Array([1]),
      );
      await expect(
        storage.read(createGetContext("omitted-options.bin", { signal }) as IStorage.ReadContext),
      ).resolves.toStrictEqual(new Uint8Array([1]));
    } finally {
      await storage.close(createCloseContext() as IStorage.CloseContext);
    }
  });
});
