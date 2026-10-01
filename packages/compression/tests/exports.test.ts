import { describe, test } from "vitest";

import Compression from "../src/compression.js";
import * as index from "../src/index.js";

describe("index のエクスポート", () => {
  test("トランスフォーマーがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.Compression).toBe(Compression);
  });
});
