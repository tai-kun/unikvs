import * as core from "@unikvs/core";
import { describe, test } from "vitest";

import {
  ClearWithoutPrefixNotAllowedError,
  KeyNotFoundError,
  LocalStorageNotAvailableError,
} from "../src/errors.js";
import * as index from "../src/index.js";
import LocalStorage from "../src/localstorage.js";

describe("index のエクスポート", () => {
  test("ストレージがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.LocalStorage).toBe(LocalStorage);
  });

  test("エラークラスがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.KeyNotFoundError).toBe(KeyNotFoundError);
    expect(index.ClearWithoutPrefixNotAllowedError).toBe(ClearWithoutPrefixNotAllowedError);
    expect(index.LocalStorageNotAvailableError).toBe(LocalStorageNotAvailableError);
  });

  test("KeyNotFoundError は core と同一物である", ({ expect }) => {
    // 実行と検証
    expect(index.KeyNotFoundError).toBe(core.KeyNotFoundError);
  });

  test("ストリーム・バイナリー用のエラーを輸出しない", ({ expect }) => {
    // 実行と検証
    expect("InvalidChunkTypeError" in index).toBe(false);
    expect("InvalidDataTypeError" in index).toBe(false);
  });
});
