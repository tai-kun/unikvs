import { describe, test } from "vitest";

import CacheStorage from "../src/cache-storage.js";
import {
  CacheStorageNotAvailableError,
  InvalidChunkTypeError,
  KeyNotFoundError,
} from "../src/errors.js";
import * as index from "../src/index.js";

describe("index のエクスポート", () => {
  test("ストレージがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.CacheStorage).toBe(CacheStorage);
  });

  test("エラーがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.CacheStorageNotAvailableError).toBe(CacheStorageNotAvailableError);
    expect(index.InvalidChunkTypeError).toBe(InvalidChunkTypeError);
    expect(index.KeyNotFoundError).toBe(KeyNotFoundError);
  });
});
