import { describe, test } from "vitest";

import { InvalidChunkTypeError, KeyNotFoundError } from "../src/errors.js";
import * as index from "../src/index.js";
import Memory from "../src/memory.js";

describe("index のエクスポート", () => {
  test("ストレージがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.Memory).toBe(Memory);
  });

  test("エラークラスがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.KeyNotFoundError).toBe(KeyNotFoundError);
    expect(index.InvalidChunkTypeError).toBe(InvalidChunkTypeError);
  });
});
