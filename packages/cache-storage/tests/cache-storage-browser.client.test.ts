import type { IStorage } from "@unikvs/core";
import {
  createHasContext,
  createSetContext,
  createOpenContext,
  createClearContext,
  createDeleteContext,
  createStreamContext,
} from "@unikvs/testing";
import { describe } from "vite-plus/test";

import CacheStorage from "../src/cache-storage.js";
import {
  test,
  readBytes,
  writeBytes,
  createRequest,
  createCacheName,
  hasNativeCaches,
} from "./_helpers.js";

const { signal } = new AbortController();

// 実 `Cache API` がない環境では実バックエンドの検証を飛ばします。
describe.skipIf(!hasNativeCaches())("実 Cache API との統合", () => {
  test("書き込み・読み取り・存在確認・削除ができる", async ({ expect }) => {
    // 準備：
    const cacheName = createCacheName();
    const storage = new CacheStorage({
      cacheName,
      toRequest: createRequest,
    });

    try {
      await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

      // 実行：
      await writeBytes(storage, "k1", new Uint8Array([1, 2, 3]));

      // 検証：
      expect(
        await storage.exists(createHasContext("k1", { signal }) as IStorage.ExistsContext),
      ).toBe(true);
      expect(await readBytes(storage, "k1")).toStrictEqual(new Uint8Array([1, 2, 3]));

      // 実行：
      await storage.delete(createDeleteContext("k1", { signal }) as IStorage.DeleteContext);

      // 検証：
      expect(
        await storage.exists(createHasContext("k1", { signal }) as IStorage.ExistsContext),
      ).toBe(false);
    } finally {
      storage.close();
      await globalThis.caches.delete(cacheName);
    }
  });

  test("write は呼び出し元の Response を消費しない", async ({ expect }) => {
    // 準備：
    const cacheName = createCacheName();
    const storage = new CacheStorage({
      cacheName,
      toRequest: createRequest,
    });

    try {
      await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
      const response = new Response(new Uint8Array([1, 2, 3]));

      // 実行：
      await storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, response);

      // 検証：
      expect(response.bodyUsed).toBe(false);
      expect(new Uint8Array(await response.arrayBuffer())).toStrictEqual(new Uint8Array([1, 2, 3]));

      expect(await readBytes(storage, "k1")).toStrictEqual(new Uint8Array([1, 2, 3]));
    } finally {
      storage.close();
      await globalThis.caches.delete(cacheName);
    }
  });

  test("ストリーム経由で書き込んだ値を読み取れる", async ({ expect }) => {
    // 準備：
    const cacheName = createCacheName();
    const storage = new CacheStorage({
      cacheName,
      toRequest: createRequest,
    });

    try {
      await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
      const writer = storage
        .getWritable(createSetContext("s1", { signal }) as IStorage.GetWritableContext)
        .getWriter();

      // 実行：
      await writer.write(new Uint8Array([4, 5]));
      await writer.close();

      await writeBytes(storage, "k2", new Uint8Array([6]));

      // 検証：
      const reader = storage
        .getReadable(createStreamContext("s1", { signal }) as IStorage.GetReadableContext)
        .getReader();
      const first = await reader.read();
      expect(first.done).toBe(false);
      expect(first.value).toStrictEqual(new Uint8Array([4, 5]));

      // 実行：
      await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

      // 検証：
      expect(
        await storage.exists(createHasContext("s1", { signal }) as IStorage.ExistsContext),
      ).toBe(false);
      expect(
        await storage.exists(createHasContext("k2", { signal }) as IStorage.ExistsContext),
      ).toBe(false);
    } finally {
      storage.close();
      await globalThis.caches.delete(cacheName);
    }
  });
});
