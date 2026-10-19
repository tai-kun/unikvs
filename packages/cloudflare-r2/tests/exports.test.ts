import { describe, test } from "vitest";

import CloudflareR2 from "../src/cloudflare-r2.js";
import { InvalidChunkTypeError, KeyNotFoundError, StorageAbortedError } from "../src/errors.js";
import * as index from "../src/index.js";

describe("index のエクスポート", () => {
  test("ストレージがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.CloudflareR2).toBe(CloudflareR2);
  });

  test("エラークラスがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.KeyNotFoundError).toBe(KeyNotFoundError);
    expect(index.StorageAbortedError).toBe(StorageAbortedError);
    expect(index.InvalidChunkTypeError).toBe(InvalidChunkTypeError);
  });
});
