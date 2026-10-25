import { test, describe } from "vite-plus/test";

// oxlint-disable import/no-namespace
import {
  KeyNotFoundError,
  InvalidMaxBytesError,
  InvalidChunkTypeError,
  InvalidMaxEntriesError,
  InvalidSizeOfResultError,
} from "../src/errors.js";
import * as index from "../src/index.js";
import LruCache from "../src/lru-cache.js";

describe("index のエクスポート", () => {
  test("ストレージがエクスポートされている", ({ expect }) => {
    // 実行と検証：
    expect(index.LruCache).toBe(LruCache);
  });

  test("エラークラスがエクスポートされている", ({ expect }) => {
    // 実行と検証：
    expect(index.KeyNotFoundError).toBe(KeyNotFoundError);
    expect(index.InvalidChunkTypeError).toBe(InvalidChunkTypeError);
    expect(index.InvalidMaxEntriesError).toBe(InvalidMaxEntriesError);
    expect(index.InvalidMaxBytesError).toBe(InvalidMaxBytesError);
    expect(index.InvalidSizeOfResultError).toBe(InvalidSizeOfResultError);
  });
});
