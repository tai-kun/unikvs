// oxlint-disable import/no-namespace
import { test, describe, expectTypeOf } from "vite-plus/test";

import { KeyNotFoundError, ExpiryInvalidExpiresAtError } from "../src/errors.js";
import Expiry from "../src/expiry.js";
import type {
  ExpiryOptions,
  ExpiresAtInput,
  ExpiryExpiredInfo,
  KeyNotFoundErrorArgs,
  KeyNotFoundErrorMeta,
  ExpiryInvalidExpiresAtErrorArgs,
  ExpiryInvalidExpiresAtErrorMeta,
} from "../src/index.js";
import * as index from "../src/index.js";

describe("index のエクスポート", () => {
  test("トランスフォーマーがエクスポートされている", ({ expect }) => {
    // 実行と検証：
    expect(index.Expiry).toBe(Expiry);
  });

  test("エラークラスがエクスポートされている", ({ expect }) => {
    // 実行と検証：
    expect(index.KeyNotFoundError).toBe(KeyNotFoundError);
    expect(index.ExpiryInvalidExpiresAtError).toBe(ExpiryInvalidExpiresAtError);
  });

  test("型がエクスポートされている", () => {
    // 実行と検証：
    // `index.js` から型を import できることで型の再輸出を確認する。
    expectTypeOf<ExpiresAtInput>().toEqualTypeOf<Date | number | string>();
    expectTypeOf<ExpiryExpiredInfo>().toEqualTypeOf<{
      readonly key: string;
      readonly expiresAt: number;
    }>();
    expectTypeOf<ExpiryOptions>().toEqualTypeOf<{
      readonly now?: (() => number) | undefined;
      readonly onExpire?: ((info: ExpiryExpiredInfo) => void) | undefined;
      readonly defaultExpiresAt?: ExpiresAtInput | undefined;
    }>();
    expectTypeOf<ExpiryInvalidExpiresAtErrorMeta>().toEqualTypeOf<{
      readonly key?: string | undefined;
      readonly actual: unknown;
    }>();
    expectTypeOf<ExpiryInvalidExpiresAtErrorArgs>().toBeObject();
    expectTypeOf<KeyNotFoundErrorMeta>().toBeObject();
    expectTypeOf<KeyNotFoundErrorArgs>().toBeObject();
  });
});
