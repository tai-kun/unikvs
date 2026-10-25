// oxlint-disable import/no-namespace
import { test, describe, expectTypeOf } from "vite-plus/test";

import { KeyNotFoundError, TtlInvalidValueError } from "../src/errors.js";
import type {
  TtlInput,
  TtlOptions,
  KeyNotFoundErrorArgs,
  KeyNotFoundErrorMeta,
  TtlInvalidValueErrorArgs,
  TtlInvalidValueErrorMeta,
} from "../src/index.js";
import * as index from "../src/index.js";
import Ttl from "../src/ttl.js";

describe("index のエクスポート", () => {
  test("ミドルウェアがエクスポートされている", ({ expect }) => {
    // 実行と検証：
    expect(index.Ttl).toBe(Ttl);
  });

  test("エラークラスがエクスポートされている", ({ expect }) => {
    // 実行と検証：
    expect(index.KeyNotFoundError).toBe(KeyNotFoundError);
    expect(index.TtlInvalidValueError).toBe(TtlInvalidValueError);
  });

  test("型がエクスポートされている", () => {
    // 実行と検証：
    // `index.js` から型を import できることで型の再輸出を確認する。
    expectTypeOf<TtlOptions>().toEqualTypeOf<{
      readonly now?: (() => number) | undefined;
      readonly defaultTtl?: TtlInput | undefined;
    }>();
    expectTypeOf<TtlInvalidValueErrorMeta>().toEqualTypeOf<{ readonly actual: unknown }>();
    expectTypeOf<TtlInvalidValueErrorArgs>().toBeObject();
    expectTypeOf<KeyNotFoundErrorMeta>().toBeObject();
    expectTypeOf<KeyNotFoundErrorArgs>().toBeObject();
  });
});
