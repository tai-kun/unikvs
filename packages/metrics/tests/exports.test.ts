import { describe, test } from "vitest";

import * as index from "../src/index.js";
import Metrics from "../src/metrics.js";

describe("index のエクスポート", () => {
  test("メトリクスミドルウェアがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.Metrics).toBe(Metrics);
  });
});
