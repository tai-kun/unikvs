import type { IMiddleware } from "@unikvs/core";
import { test, describe, expectTypeOf } from "vite-plus/test";

import PassThrough from "../src/passthrough.js";

describe("PassThrough の型", () => {
  test("PassThrough は IMiddleware として扱える", () => {
    expectTypeOf<PassThrough>().toExtend<IMiddleware>();
  });

  test("encode と decode はコンテキストと next を受けて Promise<void> を返す", () => {
    // 実行と検証：
    expectTypeOf<PassThrough["encode"]>().parameter(0).toExtend<IMiddleware.EncodeContext>();
    expectTypeOf<PassThrough["encode"]>().parameter(1).toEqualTypeOf<IMiddleware.INext>();
    expectTypeOf<PassThrough["encode"]>().returns.toEqualTypeOf<Promise<void>>();
    expectTypeOf<PassThrough["decode"]>().parameter(0).toExtend<IMiddleware.DecodeContext>();
    expectTypeOf<PassThrough["decode"]>().parameter(1).toEqualTypeOf<IMiddleware.INext>();
    expectTypeOf<PassThrough["decode"]>().returns.toEqualTypeOf<Promise<void>>();
  });

  test("encodeStream と decodeStream はコンテキストと next を受けて Promise<void> を返す", () => {
    // 実行と検証：
    expectTypeOf<PassThrough["encodeStream"]>()
      .parameter(0)
      .toExtend<IMiddleware.EncodeStreamContext>();
    expectTypeOf<PassThrough["encodeStream"]>().parameter(1).toEqualTypeOf<IMiddleware.INext>();
    expectTypeOf<PassThrough["encodeStream"]>().returns.toEqualTypeOf<Promise<void>>();
    expectTypeOf<PassThrough["decodeStream"]>()
      .parameter(0)
      .toExtend<IMiddleware.DecodeStreamContext>();
    expectTypeOf<PassThrough["decodeStream"]>().parameter(1).toEqualTypeOf<IMiddleware.INext>();
    expectTypeOf<PassThrough["decodeStream"]>().returns.toEqualTypeOf<Promise<void>>();
  });

  test("name は string、isOpen は boolean を返す", () => {
    // 準備：
    const passthrough = new PassThrough();

    // 実行と検証：
    expectTypeOf(passthrough.name).toEqualTypeOf<string>();
    expectTypeOf(passthrough.isOpen).toEqualTypeOf<boolean>();
  });
});
