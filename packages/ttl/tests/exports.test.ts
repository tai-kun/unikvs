import { describe, expectTypeOf, test } from "vitest";

import { KeyNotFoundError, TtlInvalidValueError } from "../src/errors.js";
import type {
  KeyNotFoundErrorArgs,
  KeyNotFoundErrorMeta,
  TtlInvalidValueErrorArgs,
  TtlInvalidValueErrorMeta,
  TtlInput,
  TtlOptions,
} from "../src/index.js";
import * as index from "../src/index.js";
import Ttl from "../src/ttl.js";

describe("index のエクスポート", () => {
  test("ミドルウェアがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.Ttl).toBe(Ttl);
  });

  test("エラークラスがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.KeyNotFoundError).toBe(KeyNotFoundError);
    expect(index.TtlInvalidValueError).toBe(TtlInvalidValueError);
  });

  test("型がエクスポートされている", () => {
    // 実行と検証
    // `index.js` から型を import できることで型の再輸出を確認する。
    expectTypeOf<TtlOptions>().toEqualTypeOf<{
      readonly defaultTtl?: TtlInput | undefined;
      readonly now?: (() => number) | undefined;
    }>();
    expectTypeOf<TtlInvalidValueErrorMeta>().toEqualTypeOf<{ readonly actual: unknown }>();
    expectTypeOf<TtlInvalidValueErrorArgs>().toBeObject();
    expectTypeOf<KeyNotFoundErrorMeta>().toBeObject();
    expectTypeOf<KeyNotFoundErrorArgs>().toBeObject();
  });
});
