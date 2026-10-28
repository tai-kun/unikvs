// oxlint-disable import/no-namespace
import { test, describe, expectTypeOf } from "vite-plus/test";

import {
  RetryExhaustedError,
  RetryInvalidOptionError,
  RetryUnsupportedOperationError,
} from "../src/errors.js";
import type { RetryExhaustedErrorArgs, RetryExhaustedErrorMeta } from "../src/index.js";
import * as index from "../src/index.js";
import Retry, {
  type RetryOptions,
  type RetryOperation,
  type RetryAttemptInfo,
  type RetryablePredicate,
  isRetryableError,
} from "../src/retry.js";

describe("index のエクスポート", () => {
  test("ラッパーがエクスポートされている", ({ expect }) => {
    // 実行と検証：
    expect(index.Retry).toBe(Retry);
    expect(index.isRetryableError).toBe(isRetryableError);
  });

  test("エラークラスがエクスポートされている", ({ expect }) => {
    // 実行と検証：
    expect(index.RetryExhaustedError).toBe(RetryExhaustedError);
    expect(index.RetryInvalidOptionError).toBe(RetryInvalidOptionError);
    expect(index.RetryUnsupportedOperationError).toBe(RetryUnsupportedOperationError);
  });

  test("型がエクスポートされている", () => {
    // 実行と検証：
    // `index.js` から型を import できることで型の再輸出を確認する。
    expectTypeOf<RetryOperation>().toEqualTypeOf<
      | "write"
      | "read"
      | "exists"
      | "delete"
      | "copy"
      | "move"
      | "clear"
      | "getWritable"
      | "getReadable"
    >();
    expectTypeOf<RetryablePredicate>().toBeFunction();
    expectTypeOf<RetryAttemptInfo>().toBeObject();
    expectTypeOf<RetryOptions>().toBeObject();
    expectTypeOf<RetryExhaustedErrorMeta>().toEqualTypeOf<{
      readonly attempts: number;
      readonly operation: string;
    }>();
    expectTypeOf<RetryExhaustedErrorArgs>().toBeObject();
  });
});
