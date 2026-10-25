// oxlint-disable import/no-namespace
import { test, describe } from "vite-plus/test";

import * as index from "../src/index.js";
import Tracing from "../src/tracing.js";

describe("index のエクスポート", () => {
  test("ミドルウェアがエクスポートされている", ({ expect }) => {
    // 実行と検証：
    expect(index.Tracing).toBe(Tracing);
  });
});
