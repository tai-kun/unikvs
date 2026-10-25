import { test, describe } from "vite-plus/test";

// oxlint-disable import/no-namespace
import { SuperjsonUnsupportedValueError } from "../src/errors.js";
import * as index from "../src/index.js";
import Superjson from "../src/superjson.js";

describe("index のエクスポート", () => {
  test("トランスフォーマーがエクスポートされている", ({ expect }) => {
    // 実行と検証：
    expect(index.Superjson).toBe(Superjson);
  });

  test("エラークラスがエクスポートされている", ({ expect }) => {
    // 実行と検証：
    expect(index.SuperjsonUnsupportedValueError).toBe(SuperjsonUnsupportedValueError);
  });
});
