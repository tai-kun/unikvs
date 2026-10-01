import { describe, test } from "vitest";

import Debug from "../src/debug.js";
import * as index from "../src/index.js";

describe("index のエクスポート", () => {
  test("トランスフォーマーがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.Debug).toBe(Debug);
  });
});
