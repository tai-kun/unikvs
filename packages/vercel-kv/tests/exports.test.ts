import { describe, expectTypeOf, test } from "vitest";

import {
  ClearWithoutPrefixNotAllowedError,
  ClientNotAvailableError,
  InvalidTtlSecondsError,
  KeyNotFoundError,
} from "../src/errors.js";
import type {
  InvalidTtlSecondsErrorArgs,
  InvalidTtlSecondsErrorMeta,
  KVClientLike,
  VercelKvOptions,
} from "../src/index.js";
import * as index from "../src/index.js";
import VercelKv from "../src/vercel-kv.js";

describe("index のエクスポート", () => {
  test("ストレージがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.VercelKv).toBe(VercelKv);
  });

  test("エラークラスがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.KeyNotFoundError).toBe(KeyNotFoundError);
    expect(index.InvalidTtlSecondsError).toBe(InvalidTtlSecondsError);
    expect(index.ClientNotAvailableError).toBe(ClientNotAvailableError);
    expect(index.ClearWithoutPrefixNotAllowedError).toBe(ClearWithoutPrefixNotAllowedError);
  });

  test("型がエクスポートされている", () => {
    // 実行と検証
    expectTypeOf<KVClientLike>().toBeObject();
    expectTypeOf<VercelKvOptions>().toBeObject();
    expectTypeOf<InvalidTtlSecondsErrorMeta>().toBeObject();
    expectTypeOf<InvalidTtlSecondsErrorArgs>().toBeObject();
  });

  test("VercelKvOptions 型でインスタンスを組み立てられる", ({ expect }) => {
    // 準備
    const options: VercelKvOptions = { keyPrefix: "test:", ttlSeconds: 60 };

    // 実行と検証
    expect(() => new VercelKv(options)).not.toThrow();
  });
});
