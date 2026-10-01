import { describe, test } from "vitest";

import { SuperjsonUnsupportedValueError } from "../src/errors.js";
import * as index from "../src/index.js";
import Superjson from "../src/superjson.js";

describe("index のエクスポート", () => {
  test("トランスフォーマーとエラーがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.Superjson).toBe(Superjson);
    expect(index.SuperjsonUnsupportedValueError).toBe(SuperjsonUnsupportedValueError);
  });
});
