// oxlint-disable import/no-namespace
import { test, describe, expectTypeOf } from "vite-plus/test";

import {
  KeyNotFoundError,
  WriteOnlyClearNotAllowedError,
  WriteOnlyDeleteNotAllowedError,
} from "../src/errors.js";
import type {
  WriteOnlyOptions,
  KeyNotFoundErrorArgs,
  KeyNotFoundErrorMeta,
  WriteOnlyDeleteNotAllowedErrorArgs,
  WriteOnlyDeleteNotAllowedErrorMeta,
} from "../src/index.js";
import * as index from "../src/index.js";
import WriteOnly from "../src/write-only.js";

describe("index のエクスポート", () => {
  test("トランスフォーマーがエクスポートされている", ({ expect }) => {
    // 実行と検証：
    expect(index.WriteOnly).toBe(WriteOnly);
  });

  test("エラークラスがエクスポートされている", ({ expect }) => {
    // 実行と検証：
    expect(index.KeyNotFoundError).toBe(KeyNotFoundError);
    expect(index.WriteOnlyDeleteNotAllowedError).toBe(WriteOnlyDeleteNotAllowedError);
    expect(index.WriteOnlyClearNotAllowedError).toBe(WriteOnlyClearNotAllowedError);
  });

  test("型がエクスポートされている", () => {
    // 実行と検証：
    // `index.js` から型を import できることで型の再輸出を確認する。
    expectTypeOf<WriteOnlyOptions>().toEqualTypeOf<{
      readonly allowDelete?: boolean | undefined;
    }>();
    expectTypeOf<WriteOnlyDeleteNotAllowedErrorMeta>().toEqualTypeOf<{ readonly key: string }>();
    expectTypeOf<WriteOnlyDeleteNotAllowedErrorArgs>().toBeObject();
    expectTypeOf<KeyNotFoundErrorMeta>().toBeObject();
    expectTypeOf<KeyNotFoundErrorArgs>().toBeObject();
  });
});
