import { describe, test } from "vitest";

import Base64Url from "../src/base64url.js";
import { Base64UrlDecodeError } from "../src/errors.js";
import * as index from "../src/index.js";

describe("index のエクスポート", () => {
  test("トランスフォーマーとエラーがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.Base64Url).toBe(Base64Url);
    expect(index.Base64UrlDecodeError).toBe(Base64UrlDecodeError);
  });
});
