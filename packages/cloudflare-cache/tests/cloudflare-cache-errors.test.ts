import { ErrorBase, InvalidUsageErrorBase } from "@unikvs/core";
import { describe, test } from "vitest";

import {
  CacheBindingNotFoundError,
  CacheOperationError,
  ClearNotSupportedError,
  InvalidChunkTypeError,
  InvalidKeyError,
  InvalidOriginError,
  KeyNotFoundError,
} from "../src/errors.js";

describe("エラークラスの name", () => {
  test("全クラスの name が CloudflareCache 接頭辞で固定されている", ({ expect }) => {
    // 実行と検証
    expect(new InvalidOriginError({ actual: "x" }).name).toBe("CloudflareCacheInvalidOriginError");
    expect(new InvalidKeyError({ key: "x" }).name).toBe("CloudflareCacheInvalidKeyError");
    expect(new CacheBindingNotFoundError({ property: "caches.default" }).name).toBe(
      "CloudflareCacheBindingNotFoundError",
    );
    expect(new CacheOperationError({ operation: "put", key: "k" }).name).toBe(
      "CloudflareCacheOperationError",
    );
    expect(new ClearNotSupportedError().name).toBe("CloudflareCacheClearNotSupportedError");
    expect(new InvalidChunkTypeError({ key: "k", chunk: "x" }).name).toBe(
      "CloudflareCacheInvalidChunkTypeError",
    );
  });

  test("KeyNotFoundError は core の定義を使う", ({ expect }) => {
    // 実行と検証
    expect(new KeyNotFoundError({ key: "k" }).name).toBe("UniKvsKeyNotFoundError");
  });
});

describe("エラークラスの継承", () => {
  test("値不正と操作系は ErrorBase を継承する", ({ expect }) => {
    // 実行と検証
    expect(new InvalidOriginError({ actual: "x" })).toBeInstanceOf(ErrorBase);
    expect(new InvalidKeyError({ key: "x" })).toBeInstanceOf(ErrorBase);
    expect(new CacheOperationError({ operation: "put", key: "k" })).toBeInstanceOf(ErrorBase);
    expect(new InvalidChunkTypeError({ key: "k", chunk: "x" })).toBeInstanceOf(ErrorBase);
  });

  test("非対応と欠番は InvalidUsageErrorBase を継承する", ({ expect }) => {
    // 実行と検証
    expect(new CacheBindingNotFoundError({ property: "caches.default" })).toBeInstanceOf(
      InvalidUsageErrorBase,
    );
    expect(new ClearNotSupportedError()).toBeInstanceOf(InvalidUsageErrorBase);
  });

  test("全クラスが Error を継承する", ({ expect }) => {
    // 実行と検証
    expect(new InvalidOriginError({ actual: "x" })).toBeInstanceOf(Error);
    expect(new InvalidKeyError({ key: "x" })).toBeInstanceOf(Error);
    expect(new CacheBindingNotFoundError({ property: "caches.default" })).toBeInstanceOf(Error);
    expect(new CacheOperationError({ operation: "put", key: "k" })).toBeInstanceOf(Error);
    expect(new ClearNotSupportedError()).toBeInstanceOf(Error);
    expect(new InvalidChunkTypeError({ key: "k", chunk: "x" })).toBeInstanceOf(Error);
  });
});

describe("エラークラスの meta", () => {
  test("InvalidOriginError は受け取った値を保持する", ({ expect }) => {
    // 実行と検証
    expect(new InvalidOriginError({ actual: 42 }).meta).toStrictEqual({ actual: 42 });
  });

  test("InvalidKeyError はキーを保持し cause を保持できる", ({ expect }) => {
    // 準備
    const cause = new URIError("bad");

    // 実行
    const error = new InvalidKeyError({ key: "k", cause });

    // 検証
    expect(error.meta).toStrictEqual({ key: "k" });
    expect(error.cause).toBe(cause);
  });

  test("CacheBindingNotFoundError は property を保持する", ({ expect }) => {
    // 実行と検証
    expect(new CacheBindingNotFoundError({ property: "caches.default" }).meta).toStrictEqual({
      property: "caches.default",
    });
  });

  test("CacheOperationError は操作名とキーと cause を保持する", ({ expect }) => {
    // 準備
    const cause = new TypeError("cache down");

    // 実行
    const error = new CacheOperationError({ operation: "match", key: "k", cause });

    // 検証
    expect(error.meta).toStrictEqual({ operation: "match", key: "k" });
    expect(error.cause).toBe(cause);
  });

  test("CacheOperationError は key が undefined でも組み立てられる", ({ expect }) => {
    // 実行と検証
    expect(new CacheOperationError({ operation: "put", key: undefined }).meta).toStrictEqual({
      operation: "put",
      key: undefined,
    });
  });

  test("InvalidChunkTypeError はキーとチャンクと型名を保持する", ({ expect }) => {
    // 準備
    const chunk = { invalid: true };

    // 実行
    const error = new InvalidChunkTypeError({ key: "k", chunk });

    // 検証
    expect(error.meta.key).toBe("k");
    expect(error.meta.chunk).toBe(chunk);
    expect(error.meta.chunkType).toBe("Object");
  });
});

describe("エラークラスの英語メッセージ", () => {
  test("既定の英語メッセージを返す", ({ expect }) => {
    // 実行と検証
    expect(new InvalidOriginError({ actual: "x" }).message).toBe(
      "`origin` must be an absolute URL without query or fragment, but got x",
    );
    expect(new InvalidKeyError({ key: "k" }).message).toBe(
      'Failed to encode key "k" as a URL path segment',
    );
    expect(new CacheBindingNotFoundError({ property: "caches.default" }).message).toBe(
      "No Cache binding is available. Pass a `cache` option or run on a runtime with caches.default.",
    );
    expect(new CacheOperationError({ operation: "put", key: "k" }).message).toBe(
      'Cache put failed for key "k"',
    );
    expect(new CacheOperationError({ operation: "delete", key: undefined }).message).toBe(
      "Cache delete failed",
    );
    expect(new ClearNotSupportedError().message).toBe(
      "Cache API does not support key enumeration, so clear is not supported. Delete keys one by one instead.",
    );
    expect(new InvalidChunkTypeError({ key: "k", chunk: "x" }).message).toBe(
      'Expected chunk for key "k" is Uint8Array<ArrayBuffer>, but got string',
    );
  });
});
