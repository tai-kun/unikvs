import * as core from "@unikvs/core";
import { describe, test } from "vitest";

import Cookies from "../src/cookies.js";
import { CookieNotAvailableError, CookieTooLargeError, KeyNotFoundError } from "../src/errors.js";
import * as index from "../src/index.js";

describe("index のエクスポート", () => {
  test("ストレージがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.Cookies).toBe(Cookies);
  });

  test("エラークラスがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.KeyNotFoundError).toBe(KeyNotFoundError);
    expect(index.CookieTooLargeError).toBe(CookieTooLargeError);
    expect(index.CookieNotAvailableError).toBe(CookieNotAvailableError);
  });

  test("KeyNotFoundError は core と同一物である", ({ expect }) => {
    // 実行と検証
    expect(index.KeyNotFoundError).toBe(core.KeyNotFoundError);
  });

  test("ストリーム用のエラーを輸出しない", ({ expect }) => {
    // 実行と検証
    expect("InvalidChunkTypeError" in index).toBe(false);
    expect("InvalidDataTypeError" in index).toBe(false);
  });
});
