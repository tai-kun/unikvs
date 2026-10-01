import { describe, test } from "vitest";

import BunFs from "../src/bun-fs.js";
import { UnsupportedRuntimeError } from "../src/errors.js";
import * as index from "../src/index.js";

describe("index のエクスポート", () => {
  test("ストレージがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.BunFs).toBe(BunFs);
  });

  test("エラークラスがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.UnsupportedRuntimeError).toBe(UnsupportedRuntimeError);
  });
});
