import { describe, test } from "vitest";

import {
  InvalidPartSizeError,
  StorageAbortedError,
  StorageNotOpenError,
  UnsupportedRuntimeError,
} from "../src/errors.js";
import * as index from "../src/index.js";
import S3 from "../src/s3.js";

describe("index のエクスポート", () => {
  test("ストレージがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.S3).toBe(S3);
  });

  test("エラークラスがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.InvalidPartSizeError).toBe(InvalidPartSizeError);
    expect(index.StorageAbortedError).toBe(StorageAbortedError);
    expect(index.StorageNotOpenError).toBe(StorageNotOpenError);
    expect(index.UnsupportedRuntimeError).toBe(UnsupportedRuntimeError);
  });
});
