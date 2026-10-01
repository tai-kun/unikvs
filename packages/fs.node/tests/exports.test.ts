import { describe, test } from "vitest";

import * as index from "../src/index.js";
import NodeFs from "../src/node-fs.js";

describe("index のエクスポート", () => {
  test("ストレージがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.NodeFs).toBe(NodeFs);
  });
});
