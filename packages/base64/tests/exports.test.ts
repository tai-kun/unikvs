import { describe, test } from "vitest";

import Base64 from "../src/base64.js";
import { Base64DecodeError } from "../src/errors.js";
import * as index from "../src/index.js";

describe("index のエクスポート", () => {
  test("トランスフォーマーとエラーがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.Base64).toBe(Base64);
    expect(index.Base64DecodeError).toBe(Base64DecodeError);
  });
});
