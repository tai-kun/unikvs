import type { IStorage } from "@unikvs/core";
import {
  createGetContext,
  createHasContext,
  createSetContext,
  createOpenContext,
  createClearContext,
  createCloseContext,
  createDeleteContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import Memcached from "../src/memcached.js";

const SERVERS = process.env["MEMCACHED_SERVERS"];

/**
 * 実サーバーに対する検証です。
 * `MEMCACHED_SERVERS` が未設定のときはすべてスキップされます。
 * 例 : `MEMCACHED_SERVERS=127.0.0.1:11211 pnpm --filter @unikvs/memcached test`。
 */
describe.skipIf(SERVERS === undefined || SERVERS === "")("実サーバーとの接続", () => {
  test("書き込んだデータが byte-for-byte で往復する", async ({ expect, signal }) => {
    // 準備：
    const keyPrefix = `unikvs-test-${crypto.randomUUID()}:`;
    const storage = new Memcached(SERVERS, { keyPrefix });
    await storage.open(createOpenContext() as IStorage.OpenContext);

    try {
      const key = "round-trip.bin";
      const data = new Uint8Array([1, 2, 3, 4, 5]);

      // 実行：
      await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

      const result = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);

      // 検証：
      expect(result).toStrictEqual(data);
    } finally {
      await storage.close(createCloseContext() as IStorage.CloseContext);
    }
  });

  test("exists と delete が動作する", async ({ expect, signal }) => {
    // 準備：
    const keyPrefix = `unikvs-test-${crypto.randomUUID()}:`;
    const storage = new Memcached(SERVERS, { keyPrefix });
    await storage.open(createOpenContext() as IStorage.OpenContext);

    try {
      const key = "exists.bin";
      await storage.write(
        createSetContext(key, { signal }) as IStorage.WriteContext,
        new Uint8Array([0]),
      );

      // 実行と検証：
      await expect(
        storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext),
      ).resolves.toBe(true);
      await storage.delete(createDeleteContext(key, { signal }) as IStorage.DeleteContext);
      await expect(
        storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext),
      ).resolves.toBe(false);
    } finally {
      await storage.close(createCloseContext() as IStorage.CloseContext);
    }
  });

  test("TTL 付きで書き込むと期限切れ後に読めなくなる", async ({ expect, signal }) => {
    // 準備：
    const keyPrefix = `unikvs-test-${crypto.randomUUID()}:`;
    const storage = new Memcached(SERVERS, {
      keyPrefix,
      ttlSeconds: 1,
    });
    await storage.open(createOpenContext() as IStorage.OpenContext);

    try {
      const key = "expiring.bin";
      await storage.write(
        createSetContext(key, { signal }) as IStorage.WriteContext,
        new Uint8Array([1]),
      );

      // 実行と検証 (期限内は読める)。
      await expect(
        storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext),
      ).resolves.toBe(true);

      // 期限切れまで待つ (最大 10 秒)。
      const deadline = Date.now() + 10e3;
      let expired = false;

      while (Date.now() < deadline) {
        // oxlint-disable-next-line vitest/no-conditional-in-test -- ポーリング／後始末の条件分岐はテストの進行に必須のため、使用します。
        if (!(await storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext))) {
          expired = true;
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      expect(expired).toBe(true);
    } finally {
      await storage.close(createCloseContext() as IStorage.CloseContext);
    }
  });

  test("clear で書き込んだキーが読めなくなる", async ({ expect, signal }) => {
    // 準備：
    const keyPrefix = `unikvs-test-${crypto.randomUUID()}:`;
    const storage = new Memcached(SERVERS, { keyPrefix });
    await storage.open(createOpenContext() as IStorage.OpenContext);

    try {
      await storage.write(
        createSetContext("target.bin", { signal }) as IStorage.WriteContext,
        new Uint8Array([1]),
      );

      // 実行：
      await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

      // 検証：
      await expect(
        storage.exists(createHasContext("target.bin", { signal }) as IStorage.ExistsContext),
      ).resolves.toBe(false);
    } finally {
      await storage.close(createCloseContext() as IStorage.CloseContext);
    }
  });
});
