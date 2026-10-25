import { test, describe } from "vite-plus/test";

// oxlint-disable import/no-namespace
import * as index from "../src/index.js";
import PassThrough from "../src/passthrough.js";

describe("index のエクスポート", () => {
  test("トランスフォーマーがエクスポートされている", ({ expect }) => {
    // 実行と検証：
    expect(index.PassThrough).toBe(PassThrough);
  });
});
