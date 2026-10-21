import { describe, test } from "vitest";

import {
  BlobNetworkError,
  BlobOperationError,
  BlobResponseError,
  InvalidAccessError,
  InvalidChunkTypeError,
  InvalidTokenError,
  KeyNotFoundError,
} from "../src/errors.js";
import type { BlobClientLike, VercelBlobOptions } from "../src/index.js";
import * as index from "../src/index.js";
import VercelBlob from "../src/vercel-blob.js";
import { createFakeClient, createFakeDownload } from "./_helpers.js";

describe("index のエクスポート", () => {
  test("ストレージがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.VercelBlob).toBe(VercelBlob);
  });

  test("エラークラスがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.KeyNotFoundError).toBe(KeyNotFoundError);
    expect(index.InvalidTokenError).toBe(InvalidTokenError);
    expect(index.InvalidAccessError).toBe(InvalidAccessError);
    expect(index.BlobOperationError).toBe(BlobOperationError);
    expect(index.BlobNetworkError).toBe(BlobNetworkError);
    expect(index.BlobResponseError).toBe(BlobResponseError);
    expect(index.InvalidChunkTypeError).toBe(InvalidChunkTypeError);
  });

  test("VercelBlobOptions 型でインスタンスを組み立てられる", ({ expect }) => {
    // 準備
    const client: BlobClientLike = createFakeClient();
    const { fetch } = createFakeDownload(new Map());
    const options: VercelBlobOptions = {
      client,
      fetch,
      keyPrefix: "test/",
      access: "public",
      token: "secret",
    };

    // 実行と検証
    expect(() => new VercelBlob(options)).not.toThrow();
  });
});
