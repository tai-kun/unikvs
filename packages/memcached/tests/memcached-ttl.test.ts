import type { IStorage } from "@unikvs/core";
import {
  createGetContext,
  createHasContext,
  createSetContext,
  createOpenContext,
  createCloseContext,
} from "@unikvs/testing";
import { vi, describe } from "vite-plus/test";

import { KeyNotFoundError } from "../src/errors.js";
import Memcached from "../src/memcached.js";
import { test, FakeMemcachedClient } from "./_helpers.js";

describe("TTL 付きキャッシュ", () => {
  test("ttlSeconds を指定したとき、set に有効期限が渡される", async ({
    client,
    expect,
    signal,
    keyPrefix,
  }) => {
    // 準備：
    const storage = new Memcached(undefined, {
      client,
      keyPrefix,
      ttlSeconds: 60,
    });
    await storage.open(createOpenContext() as IStorage.OpenContext);

    try {
      // 実行：
      await storage.write(
        createSetContext("ttl.bin", { signal }) as IStorage.WriteContext,
        new Uint8Array([1, 2, 3]),
      );

      // 検証：
      expect(client.setCalls).toStrictEqual([
        {
          key: `${keyPrefix}ttl.bin`,
          value: "AQID",
          expires: 60,
        },
      ]);
    } finally {
      await storage.close(createCloseContext() as IStorage.CloseContext);
    }
  });

  test("有効期限内は読み取れるが、期限切れ後は KeyNotFoundError になる", async ({
    client,
    expect,
    signal,
    keyPrefix,
  }) => {
    // 準備：
    const storage = new Memcached(undefined, {
      client,
      keyPrefix,
      ttlSeconds: 60,
    });
    await storage.open(createOpenContext() as IStorage.OpenContext);

    try {
      await storage.write(
        createSetContext("expiring.bin", { signal }) as IStorage.WriteContext,
        new Uint8Array([7]),
      );

      // 実行と検証 (期限内)。
      client.advance(59_999);
      await expect(
        storage.exists(createHasContext("expiring.bin", { signal }) as IStorage.ExistsContext),
      ).resolves.toBe(true);

      // 実行と検証 (期限切れ)。
      client.advance(1);
      await expect(
        storage.exists(createHasContext("expiring.bin", { signal }) as IStorage.ExistsContext),
      ).resolves.toBe(false);
      await expect(
        storage.read(createGetContext("expiring.bin", { signal }) as IStorage.ReadContext),
      ).rejects.toThrow(KeyNotFoundError);
    } finally {
      await storage.close(createCloseContext() as IStorage.CloseContext);
    }
  });

  test("ttlSeconds を省略したとき、有効期限なしで保存される", async ({
    client,
    expect,
    signal,
    keyPrefix,
  }) => {
    // 準備：
    const storage = new Memcached(undefined, {
      client,
      keyPrefix,
    });
    await storage.open(createOpenContext() as IStorage.OpenContext);

    try {
      // 実行：
      await storage.write(
        createSetContext("persistent.bin", { signal }) as IStorage.WriteContext,
        new Uint8Array([9]),
      );
      client.advance(365 * 24 * 3600 * 1000);

      // 検証：
      expect(client.setCalls).toStrictEqual([
        {
          key: `${keyPrefix}persistent.bin`,
          value: "CQ==",
          expires: 0,
        },
      ]);
      await expect(
        storage.exists(createHasContext("persistent.bin", { signal }) as IStorage.ExistsContext),
      ).resolves.toBe(true);
    } finally {
      await storage.close(createCloseContext() as IStorage.CloseContext);
    }
  });

  test("ttlSeconds が 30 日ちょうどのとき相対秒のまま送る", async ({
    client,
    expect,
    signal,
    keyPrefix,
  }) => {
    // 準備：
    const ttlSeconds = 2_592_000;
    const storage = new Memcached(undefined, {
      client,
      keyPrefix,
      ttlSeconds,
    });
    await storage.open(createOpenContext() as IStorage.OpenContext);

    try {
      // 実行：
      await storage.write(
        createSetContext("boundary.bin", { signal }) as IStorage.WriteContext,
        new Uint8Array([1]),
      );

      // 検証：
      expect(client.setCalls[0]?.expires).toBe(ttlSeconds);
    } finally {
      await storage.close(createCloseContext() as IStorage.CloseContext);
    }
  });

  test("書き直すと有効期限が更新される", async ({ client, expect, signal, keyPrefix }) => {
    // 準備：
    const storage = new Memcached(undefined, {
      client,
      keyPrefix,
      ttlSeconds: 60,
    });
    await storage.open(createOpenContext() as IStorage.OpenContext);

    try {
      await storage.write(
        createSetContext("renewed.bin", { signal }) as IStorage.WriteContext,
        new Uint8Array([1]),
      );

      // 実行：
      client.advance(50_000);
      await storage.write(
        createSetContext("renewed.bin", { signal }) as IStorage.WriteContext,
        new Uint8Array([2]),
      );
      client.advance(50_000);

      // 検証 (初回期限を過ぎても読み取れる)。
      await expect(
        storage.read(createGetContext("renewed.bin", { signal }) as IStorage.ReadContext),
      ).resolves.toStrictEqual(new Uint8Array([2]));

      client.advance(10_000);
      await expect(
        storage.exists(createHasContext("renewed.bin", { signal }) as IStorage.ExistsContext),
      ).resolves.toBe(false);
    } finally {
      await storage.close(createCloseContext() as IStorage.CloseContext);
    }
  });

  test("ttlSeconds が 30 日を超えるとき絶対 Unix 時刻で送り、期限内は読み取れる", async ({
    expect,
    signal,
    keyPrefix,
  }) => {
    vi.useFakeTimers();

    try {
      // 準備：
      const now = new Date("2026-01-01T00:00:00.000Z");
      vi.setSystemTime(now);

      const client = new FakeMemcachedClient();
      const ttlSeconds = 31 * 24 * 60 * 60;
      const storage = new Memcached(undefined, {
        client,
        keyPrefix,
        ttlSeconds,
      });
      await storage.open(createOpenContext() as IStorage.OpenContext);

      try {
        // 実行：
        await storage.write(
          createSetContext("long-ttl.bin", { signal }) as IStorage.WriteContext,
          new Uint8Array([1]),
        );

        // 検証 (絶対 Unix 時刻として送られる)。
        const expected = Math.floor(now.getTime() / 1000) + ttlSeconds;
        expect(client.setCalls).toStrictEqual([
          {
            key: `${keyPrefix}long-ttl.bin`,
            value: "AQ==",
            expires: expected,
          },
        ]);
        expect(expected).toBeGreaterThan(2_592_000);

        // 検証 (期限内は読み取れる)。
        client.advance(ttlSeconds * 1000 - 5000);
        await expect(
          storage.read(createGetContext("long-ttl.bin", { signal }) as IStorage.ReadContext),
        ).resolves.toStrictEqual(new Uint8Array([1]));

        // 検証 (期限切れ後は読めない)。
        client.advance(5000);
        await expect(
          storage.exists(createHasContext("long-ttl.bin", { signal }) as IStorage.ExistsContext),
        ).resolves.toBe(false);
        await expect(
          storage.read(createGetContext("long-ttl.bin", { signal }) as IStorage.ReadContext),
        ).rejects.toThrow(KeyNotFoundError);
      } finally {
        await storage.close(createCloseContext() as IStorage.CloseContext);
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
