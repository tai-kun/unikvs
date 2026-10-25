// oxlint-disable import/no-namespace
import * as core from "@unikvs/core";
import { test, describe } from "vite-plus/test";

import Cookies from "../src/cookies.js";
import { KeyNotFoundError, CookieTooLargeError, CookieNotAvailableError } from "../src/errors.js";
import * as index from "../src/index.js";

describe("index のエクスポート", () => {
  test("ストレージがエクスポートされている", ({ expect }) => {
    // 実行と検証：
    expect(index.Cookies).toBe(Cookies);
  });

  test("エラークラスがエクスポートされている", ({ expect }) => {
    // 実行と検証：
    expect(index.KeyNotFoundError).toBe(KeyNotFoundError);
    expect(index.CookieTooLargeError).toBe(CookieTooLargeError);
    expect(index.CookieNotAvailableError).toBe(CookieNotAvailableError);
  });

  test("KeyNotFoundError は core と同一物である", ({ expect }) => {
    // 実行と検証：
    expect(index.KeyNotFoundError).toBe(core.KeyNotFoundError);
  });
});
