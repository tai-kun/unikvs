import { spawn } from "node:child_process";

import { Redis as Ioredis } from "ioredis";
import { afterEach, describe, expectTypeOf, vi } from "vitest";

import { ClusterNotSupportedError, InvalidCloseTimeoutError } from "../src/errors.js";
import Redis, { type RedisStorageOptions } from "../src/redis.js";
import { test, waitForPort } from "./_helpers.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Node 固有の振る舞い", () => {
  test("url が REDIS_URL・VALKEY_URL より優先される", async ({ expect, signal, url }) => {
    // 準備
    vi.stubEnv("REDIS_URL", "redis://127.0.0.1:1");
    vi.stubEnv("VALKEY_URL", "redis://127.0.0.1:1");
    const storage = new Redis(url, { keyPrefix: `env-priority-${crypto.randomUUID()}:` });

    // 実行
    await storage.open();

    try {
      // 検証
      expect(storage.isOpen).toBe(true);
      await storage.write({ key: "a", data: new Uint8Array([1]), signal, vars: {} });
      await expect(storage.read({ key: "a", signal })).resolves.toStrictEqual(new Uint8Array([1]));
    } finally {
      await storage.close();
    }
  });

  test("url を未指定にしたとき、REDIS_URL から解決する", async ({ expect, signal, url }) => {
    // 準備
    vi.stubEnv("REDIS_URL", url);
    const storage = new Redis(undefined, { keyPrefix: `env-redis-url-${crypto.randomUUID()}:` });

    // 実行
    await storage.open();

    try {
      // 検証
      expect(storage.isOpen).toBe(true);
      await expect(storage.exists({ key: "a", signal })).resolves.toBe(false);
    } finally {
      await storage.close();
    }
  });

  test("REDIS_URL がないとき、VALKEY_URL から解決する", async ({ expect, signal, url }) => {
    // 準備
    vi.stubEnv("REDIS_URL", "");
    vi.stubEnv("VALKEY_URL", url);
    const storage = new Redis(undefined, { keyPrefix: `env-valkey-url-${crypto.randomUUID()}:` });

    // 実行
    await storage.open();

    try {
      // 検証
      expect(storage.isOpen).toBe(true);
      await expect(storage.exists({ key: "a", signal })).resolves.toBe(false);
    } finally {
      await storage.close();
    }
  });

  test("空文字を指定したとき、未指定扱いで次の候補に進む", async ({ expect, signal, url }) => {
    // 準備
    vi.stubEnv("REDIS_URL", "");
    vi.stubEnv("VALKEY_URL", url);
    const storage = new Redis("", { keyPrefix: `env-empty-${crypto.randomUUID()}:` });

    // 実行
    await storage.open();

    try {
      // 検証
      expect(storage.isOpen).toBe(true);
      await expect(storage.exists({ key: "a", signal })).resolves.toBe(false);
    } finally {
      await storage.close();
    }
  });

  test("url も環境変数もないとき、127.0.0.1:6379 に接続する", async ({ expect, signal }) => {
    // 準備
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
      // 実行
      await storage.open();

      // 検証
      expect(storage.isOpen).toBe(true);
      await storage.write({ key: "a", data: new Uint8Array([1]), signal, vars: {} });
      await expect(storage.read({ key: "a", signal })).resolves.toStrictEqual(new Uint8Array([1]));
    } finally {
      if (storage.isOpen) {
        await storage.close();
      }
      if (!fixed.killed) {
        fixed.kill();
      }
    }
  });

  test("到達不能のとき、open は有限時間で拒否されプロセスは落ちない", async ({
    expect,
    keyPrefix,
  }) => {
    // 準備
    const unreachable = new Redis("redis://127.0.0.1:1", { keyPrefix, connectTimeout: 500 });

    // 実行と検証
    const start = Date.now();
    await expect(unreachable.open()).rejects.toThrow();
    expect(Date.now() - start).toBeLessThan(10e3);
    expect(unreachable.isOpen).toBe(false);
  });

  test("quit がハングしたとき、close は closeTimeout で復帰して disconnect する", async ({
    expect,
    keyPrefix,
    url,
  }) => {
    // 準備
    // V3-S2 の固定手順に従う。
    // プロトタイプへの spy と `restoreAllMocks` による後始末を行う。
    // 単体レベルの検証で済ませる。
    const quitSpy = vi
      .spyOn(Ioredis.prototype, "quit")
      .mockImplementation(() => new Promise<never>(() => {}));
    const disconnectSpy = vi.spyOn(Ioredis.prototype, "disconnect");
    const storage = new Redis(url, { keyPrefix, closeTimeout: 100 });
    await storage.open();

    try {
      // 実行と検証
      const start = Date.now();
      await storage.close();
      expect(Date.now() - start).toBeLessThan(10e3);
      expect(quitSpy).toHaveBeenCalled();
      expect(disconnectSpy).toHaveBeenCalled();
      expect(storage.isOpen).toBe(false);
    } finally {
      vi.restoreAllMocks();
      if (storage.isOpen) {
        await storage.close();
      }
    }
  });

  test("closeTimeout に不正値を指定したとき、コンストラクタは InvalidCloseTimeoutError で拒否する", ({
    expect,
    keyPrefix,
    url,
  }) => {
    // 準備
    const invalidValues = [0, -1, Number.NaN, Number.POSITIVE_INFINITY, "100"];

    // 実行と検証
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
      ).toThrow(/`closeTimeout` must be a finite positive number/);
    }
    // `undefined` は既定値 5000ms になるため対象外とする。
    expect(() => new Redis(url, { keyPrefix, closeTimeout: undefined })).not.toThrow();
  });

  test("cluster を指定したとき、standalone 専用のエラーで拒否される", ({
    expect,
    keyPrefix,
    url,
  }) => {
    // 準備
    const make = (): Redis =>
      new Redis(url, {
        keyPrefix,
        cluster: { nodes: [{ host: "127.0.0.1", port: 6379 }] },
      });

    // 実行と検証
    expect(make).toThrow(ClusterNotSupportedError);
    expect(make).toThrow(/standalone/);
  });

  test("lazyConnect は型レベルで受け付けられない", () => {
    // 実行と検証
    // `expect-type` 1.4.0 に `.not.toHaveProperty` があることを確認したため、本形に固定する (V3-N1)。
    expectTypeOf<RedisStorageOptions>().not.toHaveProperty("lazyConnect");
  });

  test("keyPrefix は ioredis 備え付け prefix として二重に付与されない", async ({
    expect,
    signal,
    url,
  }) => {
    // 準備
    // V3-S1 の固定手順に従う。
    // 主手順は観測可能な振る舞い (一重 prefix) とする。
    // 内部透過バッグの確認は `as unknown as { options: Record<string, unknown> }` の cast 断片で行う。
    // `any` 直参照はしない。
    const key = `d-prime-${crypto.randomUUID()}.bin`;
    const storage = new Redis(url, { keyPrefix: "p:" });
    await storage.open();

    try {
      // 実行
      await storage.write({ key, data: new Uint8Array([1]), signal, vars: {} });

      // 検証
      const raw = new Ioredis(url);
      try {
        const keys = await raw.keys("*");
        expect(keys).toContain(`p:${key}`);
        expect(keys).not.toContain(`p:p:${key}`);
      } finally {
        await raw.quit();
      }
      expect(
        (storage as unknown as { options: Record<string, unknown> }).options,
      ).not.toHaveProperty("keyPrefix");
    } finally {
      await storage.close();
    }
  });

  test("第 2 引数を省略した new Redis(url) でもエラーにならない", async ({
    expect,
    signal,
    url,
  }) => {
    // 準備と実行
    const storage = new Redis(url);

    // 検証
    expect(storage.isOpen).toBe(false);
    expect(storage.allowRepair).toBe(false);
    await storage.open();

    try {
      expect(storage.isOpen).toBe(true);
      await storage.write({
        key: "omitted-options.bin",
        data: new Uint8Array([1]),
        signal,
        vars: {},
      });
      await expect(storage.read({ key: "omitted-options.bin", signal })).resolves.toStrictEqual(
        new Uint8Array([1]),
      );
    } finally {
      await storage.close();
    }
  });
});
