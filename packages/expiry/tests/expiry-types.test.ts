import { describe, expectTypeOf, test } from "vitest";

import type { ExpiryOptions, ExpiresAtInput } from "../src/expiry.js";

describe("expiry の型", () => {
  test("ExpiresAtInput は Date と数値と文字列を受け付ける", () => {
    // 実行と検証
    expectTypeOf<ExpiresAtInput>().toEqualTypeOf<Date | number | string>();
    expectTypeOf(new Date()).toMatchTypeOf<ExpiresAtInput>();
    expectTypeOf(1_000_000).toMatchTypeOf<ExpiresAtInput>();
    expectTypeOf(new Date().toISOString()).toMatchTypeOf<ExpiresAtInput>();
  });

  test("ExpiryOptions はすべて省略可能である", () => {
    // 実行と検証
    expectTypeOf<ExpiryOptions>().toEqualTypeOf<{
      readonly defaultExpiresAt?: ExpiresAtInput | undefined;
      readonly now?: (() => number) | undefined;
      readonly onExpire?:
        | ((info: { readonly key: string; readonly expiresAt: number }) => void)
        | undefined;
    }>();
    expectTypeOf({}).toMatchTypeOf<ExpiryOptions>();
  });
});
