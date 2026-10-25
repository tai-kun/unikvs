// oxlint-disable import/no-namespace
import { test, describe } from "vite-plus/test";

import CacheStorage from "../src/cache-storage.js";
import {
  KeyNotFoundError,
  InvalidChunkTypeError,
  CacheStorageNotAvailableError,
} from "../src/errors.js";
import * as index from "../src/index.js";

describe("index のエクスポート", () => {
  test("ストレージがエクスポートされている", ({ expect }) => {
    // 実行と検証：
    expect(index.CacheStorage).toBe(CacheStorage);
  });

  test("エラーがエクスポートされている", ({ expect }) => {
    // 実行と検証：
    expect(index.CacheStorageNotAvailableError).toBe(CacheStorageNotAvailableError);
    expect(index.InvalidChunkTypeError).toBe(InvalidChunkTypeError);
    expect(index.KeyNotFoundError).toBe(KeyNotFoundError);
  });
});
