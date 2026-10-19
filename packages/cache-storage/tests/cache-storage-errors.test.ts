import type { IStorage } from "@unikvs/core";
import {
  createClearContext,
  createCloseContext,
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
import { createCacheName, createFakeCaches, runWithGlobalCaches } from "./_helpers.js";

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
      expect(() => new CacheStorage(createCacheName())).not.toThrow();
    });
  });

  test("注入なしの全操作は CacheStorageNotAvailableError を投げる", async ({ expect }) => {
    // 実行と検証
    await withoutBackend(async () => {
      const storage = new CacheStorage(createCacheName());
      await expect(
        storage.open(createOpenContext({ signal }) as IStorage.OpenContext),
      ).rejects.toThrow(CacheStorageNotAvailableError);
      await expect(
        storage.write(createSetContext("k", { signal }) as IStorage.WriteContext, new Uint8Array()),
      ).rejects.toThrow(CacheStorageNotAvailableError);
      await expect(
        storage.read(createGetContext("k", { signal }) as IStorage.ReadContext),
      ).rejects.toThrow(CacheStorageNotAvailableError);
      await expect(
        storage.exists(createHasContext("k", { signal }) as IStorage.ExistsContext),
      ).rejects.toThrow(CacheStorageNotAvailableError);
      await expect(
        storage.delete(createDeleteContext("k", { signal }) as IStorage.DeleteContext),
      ).rejects.toThrow(CacheStorageNotAvailableError);
      await expect(
        storage.clear(createClearContext("", { signal }) as IStorage.ClearContext),
      ).rejects.toThrow(CacheStorageNotAvailableError);
      expect(() =>
        storage.getWritable(createSetContext("k", { signal }) as IStorage.GetWritableContext),
      ).toThrow(CacheStorageNotAvailableError);
      expect(() =>
        storage.getReadable(createStreamContext("k", { signal }) as IStorage.GetReadableContext),
      ).toThrow(CacheStorageNotAvailableError);
    });
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
      const storage = new CacheStorage(createCacheName(), { caches: createFakeCaches() });
      await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
      await storage.write(
        createSetContext("k", { signal }) as IStorage.WriteContext,
        new Uint8Array([1]),
      );
      expect(
        await storage.read(createGetContext("k", { signal }) as IStorage.ReadContext),
      ).toStrictEqual(new Uint8Array([1]));
      await storage.close(createCloseContext({ signal }) as IStorage.CloseContext);
    });
  });
});

describe("未オープン時の誤用", () => {
  test("backend があっても open 前の操作は TypeError を投げる", async ({ expect }) => {
    // 準備
    const storage = new CacheStorage(createCacheName(), { caches: createFakeCaches() });

    // 実行と検証
    await expect(
      storage.write(
        createSetContext("k", { signal }) as IStorage.WriteContext,
        new Uint8Array([1]),
      ),
    ).rejects.toThrow("CacheStorage is not open");
    await expect(
      storage.read(createGetContext("k", { signal }) as IStorage.ReadContext),
    ).rejects.toThrow(TypeError);
    expect(() =>
      storage.getWritable(createSetContext("k", { signal }) as IStorage.GetWritableContext),
    ).toThrow(TypeError);
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
