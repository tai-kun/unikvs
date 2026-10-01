import { describe, test } from "vitest";

import * as index from "../src/index.js";
import PassThrough from "../src/passthrough.js";

describe("index のエクスポート", () => {
  test("トランスフォーマーがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.PassThrough).toBe(PassThrough);
  });
});
