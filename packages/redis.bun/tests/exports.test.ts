import { describe, test } from "vitest";

import { KeyNotFoundError, UnsupportedRuntimeError } from "../src/errors.js";
import * as index from "../src/index.js";
import Redis from "../src/redis.js";

describe("index のエクスポート", () => {
  test("ストレージがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.Redis).toBe(Redis);
  });

  test("エラークラスがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.KeyNotFoundError).toBe(KeyNotFoundError);
    expect(index.UnsupportedRuntimeError).toBe(UnsupportedRuntimeError);
  });
});
