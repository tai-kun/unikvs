import { describe, test } from "vitest";

import { KeyNotFoundError } from "../src/errors.js";
import * as index from "../src/index.js";
import WriteOnly from "../src/write-only.js";

describe("index のエクスポート", () => {
  test("ストレージがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.WriteOnly).toBe(WriteOnly);
  });

  test("エラークラスがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.KeyNotFoundError).toBe(KeyNotFoundError);
  });
});
