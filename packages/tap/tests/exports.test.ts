import { test, describe } from "vite-plus/test";

// oxlint-disable import/no-namespace
import * as index from "../src/index.js";
import Tap from "../src/tap.js";

describe("index のエクスポート", () => {
  test("ミドルウェアがエクスポートされている", ({ expect }) => {
    // 実行と検証：
    expect(index.Tap).toBe(Tap);
  });
});
