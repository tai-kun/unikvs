import { describe, test } from "vitest";

import { KeyNotFoundError } from "../src/errors.js";
import * as index from "../src/index.js";
import Null from "../src/null.js";

describe("index のエクスポート", () => {
  test("ストレージがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.Null).toBe(Null);
  });

  test("エラークラスがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.KeyNotFoundError).toBe(KeyNotFoundError);
  });
});
