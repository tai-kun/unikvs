import { describe, test } from "vitest";

import { JsonUnsupportedValueError } from "../src/errors.js";
import * as index from "../src/index.js";
import Json from "../src/json.js";

describe("index のエクスポート", () => {
  test("トランスフォーマーがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.Json).toBe(Json);
  });

  test("エラークラスがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.JsonUnsupportedValueError).toBe(JsonUnsupportedValueError);
  });
});
