import type { IStorage } from "@unikvs/core";
import {
  createClearContext,
  createDeleteContext,
  createGetContext,
  createHasContext,
  createOpenContext,
  createSetContext,
  createStreamContext,
} from "@unikvs/testing";
import { describe, test } from "vitest";

import CacheStorage from "../src/cache-storage.js";
import {
  CacheStorageNotAvailableError,
  InvalidChunkTypeError,
  KeyNotFoundError,
} from "../src/errors.js";
import {
  createCacheName,
  createFakeCaches,
  createRequest,
  readBytes,
  runWithGlobalCaches,
  writeBytes,
} from "./_helpers.js";

const { signal } = new AbortController();

/**
 * backend 不在の環境で関数を実行します。
 * `globalThis.caches` を一時的に隠して SSR 環境を再現するために使用します。
 */
function withoutBackend<T>(fn: () => T): T {
  return runWithGlobalCaches(undefined, fn);
}

describe("Cache API 不在の環境", () => {
  test("コンストラクターは backend 不在でも throw しない", ({ expect }) => {
    // 実行と検証
    withoutBackend(() => {
      expect(
        () => new CacheStorage({ cacheName: createCacheName(), toRequest: createRequest }),
      ).not.toThrow();
    });
  });

  test("open は CacheStorageNotAvailableError を投げる", async ({ expect }) => {
    // 準備
    const storage = new CacheStorage({ cacheName: createCacheName(), toRequest: createRequest });

    // 実行と検証
    await withoutBackend(() =>
      expect(storage.open(createOpenContext({ signal }) as IStorage.OpenContext)).rejects.toThrow(
        CacheStorageNotAvailableError,
      ),
    );
    expect(storage.isOpen).toBe(false);
  });

  test("CacheStorageNotAvailableError は利用エラーである", ({ expect }) => {
    // 実行と検証
    const error = new CacheStorageNotAvailableError();
    expect(error).toBeInstanceOf(CacheStorageNotAvailableError);
    expect(error.name).toBe("CacheStorageNotAvailableError");
    expect(error.message).toContain("Cache API is not available");
  });

  test("注入フェイクがあれば backend 不在環境でも CRUD できる", async ({ expect }) => {
    // 実行と検証
    await withoutBackend(async () => {
      const storage = new CacheStorage({
        cacheName: createCacheName(),
        caches: createFakeCaches(),
        toRequest: createRequest,
      });
      await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
      await writeBytes(storage, "k", new Uint8Array([1]));
      expect(await readBytes(storage, "k")).toStrictEqual(new Uint8Array([1]));
      await storage.close();
    });
  });
});

describe("未オープン時の誤用", () => {
  test("open 前の非ストリーム操作は TypeError を投げる", async ({ expect }) => {
    // 準備
    const storage = new CacheStorage({
      cacheName: createCacheName(),
      caches: createFakeCaches(),
      toRequest: createRequest,
    });

    // 実行と検証
    await expect(
      storage.write(
        createSetContext("k", { signal }) as IStorage.WriteContext,
        new Response(new Uint8Array([1])),
      ),
    ).rejects.toThrow(TypeError);
    await expect(
      storage.read(createGetContext("k", { signal }) as IStorage.ReadContext),
    ).rejects.toThrow(TypeError);
    await expect(
      storage.exists(createHasContext("k", { signal }) as IStorage.ExistsContext),
    ).rejects.toThrow(TypeError);
    await expect(
      storage.delete(createDeleteContext("k", { signal }) as IStorage.DeleteContext),
    ).rejects.toThrow(TypeError);
    await expect(
      storage.clear(createClearContext("", { signal }) as IStorage.ClearContext),
    ).rejects.toThrow(TypeError);
  });

  test("open 前のストリーム操作は使用時に TypeError を投げる", async ({ expect }) => {
    // 準備
    const storage = new CacheStorage({
      cacheName: createCacheName(),
      caches: createFakeCaches(),
      toRequest: createRequest,
    });
    const writer = storage
      .getWritable(createSetContext("k", { signal }) as IStorage.GetWritableContext)
      .getWriter();
    const reader = storage
      .getReadable(createStreamContext("k", { signal }) as IStorage.GetReadableContext)
      .getReader();

    // 実行と検証
    await expect(writer.close()).rejects.toThrow(TypeError);
    await expect(reader.read()).rejects.toThrow(TypeError);
  });
});

describe("エラーの形状", () => {
  test("InvalidChunkTypeError はキーとチャンク型を持つ", ({ expect }) => {
    // 実行
    const error = new InvalidChunkTypeError({ key: "k1", chunk: "abc" });

    // 検証
    expect(error).toBeInstanceOf(InvalidChunkTypeError);
    expect(error.name).toBe("CacheStorageInvalidChunkTypeError");
    expect(error.message).toContain("k1");
    expect(error.message).toContain("Uint8Array");
  });

  test("KeyNotFoundError が再エクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(new KeyNotFoundError({ key: "k" })).toBeInstanceOf(KeyNotFoundError);
  });
});
