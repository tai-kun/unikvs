// oxlint-disable import/no-namespace
import { test, describe } from "vite-plus/test";

import CloudflareKv, {
  type KVNamespaceLike,
  type CloudflareKvOptions,
} from "../src/cloudflare-kv.js";
import {
  KeyNotFoundError,
  InvalidBindingError,
  InvalidKeyPrefixError,
  InvalidTtlSecondsError,
} from "../src/errors.js";
import * as index from "../src/index.js";
import { FakeKVNamespace } from "./_helpers.js";

describe("index のエクスポート", () => {
  test("ストレージがエクスポートされている", ({ expect }) => {
    // 実行と検証：
    expect(index.CloudflareKv).toBe(CloudflareKv);
  });

  test("エラークラスがエクスポートされている", ({ expect }) => {
    // 実行と検証：
    expect(index.KeyNotFoundError).toBe(KeyNotFoundError);
    expect(index.InvalidBindingError).toBe(InvalidBindingError);
    expect(index.InvalidKeyPrefixError).toBe(InvalidKeyPrefixError);
    expect(index.InvalidTtlSecondsError).toBe(InvalidTtlSecondsError);
  });

  test("CloudflareKvOptions 型でインスタンスを組み立てられる", ({ expect }) => {
    // 準備：
    const binding: KVNamespaceLike = new FakeKVNamespace();
    const options: CloudflareKvOptions = {
      binding,
      keyPrefix: "test:",
      ttlSeconds: 60,
    };

    // 実行と検証：
    expect(() => new CloudflareKv(options)).not.toThrow();
  });
});
