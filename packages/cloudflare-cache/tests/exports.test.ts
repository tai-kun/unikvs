// oxlint-disable import/no-namespace
import { test, describe } from "vite-plus/test";

import CloudflareCache, { type CloudflareCacheOptions } from "../src/cloudflare-cache.js";
import {
  InvalidKeyError,
  KeyNotFoundError,
  InvalidOriginError,
  CacheOperationError,
  InvalidChunkTypeError,
  ClearNotSupportedError,
  CacheBindingNotFoundError,
} from "../src/errors.js";
import * as index from "../src/index.js";
import { createFakeCache } from "./_helpers.js";

describe("index のエクスポート", () => {
  test("ストレージがエクスポートされている", ({ expect }) => {
    // 実行と検証：
    expect(index.CloudflareCache).toBe(CloudflareCache);
  });

  test("エラークラスがエクスポートされている", ({ expect }) => {
    // 実行と検証：
    expect(index.KeyNotFoundError).toBe(KeyNotFoundError);
    expect(index.InvalidOriginError).toBe(InvalidOriginError);
    expect(index.InvalidKeyError).toBe(InvalidKeyError);
    expect(index.CacheBindingNotFoundError).toBe(CacheBindingNotFoundError);
    expect(index.CacheOperationError).toBe(CacheOperationError);
    expect(index.ClearNotSupportedError).toBe(ClearNotSupportedError);
    expect(index.InvalidChunkTypeError).toBe(InvalidChunkTypeError);
  });

  test("CloudflareCacheOptions 型でインスタンスを組み立てられる", ({ expect }) => {
    // 準備：
    const options: CloudflareCacheOptions = {
      cache: createFakeCache(),
      origin: "https://example.com/cache",
    };

    // 実行と検証：
    expect(() => new CloudflareCache(options)).not.toThrow();
  });
});
