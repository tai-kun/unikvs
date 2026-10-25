import type { IMiddleware } from "@unikvs/core";
import { test, describe, expectTypeOf } from "vite-plus/test";

import ReadOnly from "../src/readonly.js";

describe("ReadOnly の型", () => {
  test("ReadOnly は IMiddleware として扱える", () => {
    expectTypeOf<ReadOnly>().toExtend<IMiddleware>();
  });

  test("コンストラクターは引数なしで組み立てられる", () => {
    // 実行と検証：
    expectTypeOf(new ReadOnly()).toEqualTypeOf<ReadOnly>();
  });

  test("コンストラクターは ReadOnlyOptions を受け取れる", () => {
    // 実行と検証：
    expectTypeOf(new ReadOnly({ allowDelete: true })).toEqualTypeOf<ReadOnly>();
  });

  test("encode はコンテキストと next を受けて Promise<void> を返す", () => {
    // 実行と検証：
    expectTypeOf<ReadOnly["encode"]>().parameter(0).toEqualTypeOf<IMiddleware.EncodeContext>();
    expectTypeOf<ReadOnly["encode"]>().parameter(1).toEqualTypeOf<IMiddleware.INext>();
    expectTypeOf<ReadOnly["encode"]>().returns.toEqualTypeOf<Promise<void>>();
  });

  test("decode は DecodeContext と next を受けて Promise<void> を返す", () => {
    // 実行と検証：
    expectTypeOf<ReadOnly["decode"]>().parameter(0).toEqualTypeOf<IMiddleware.DecodeContext>();
    expectTypeOf<ReadOnly["decode"]>().parameter(1).toEqualTypeOf<IMiddleware.INext>();
    expectTypeOf<ReadOnly["decode"]>().returns.toEqualTypeOf<Promise<void>>();
  });

  test("encodeStream と decodeStream の引数と戻り値の型を保持する", () => {
    // 実行と検証：
    expectTypeOf<ReadOnly["encodeStream"]>()
      .parameter(0)
      .toEqualTypeOf<IMiddleware.EncodeStreamContext>();
    expectTypeOf<ReadOnly["encodeStream"]>().parameter(1).toEqualTypeOf<IMiddleware.INext>();
    expectTypeOf<ReadOnly["encodeStream"]>().returns.toEqualTypeOf<Promise<void>>();
    expectTypeOf<ReadOnly["decodeStream"]>()
      .parameter(0)
      .toEqualTypeOf<IMiddleware.DecodeStreamContext>();
    expectTypeOf<ReadOnly["decodeStream"]>().parameter(1).toEqualTypeOf<IMiddleware.INext>();
    expectTypeOf<ReadOnly["decodeStream"]>().returns.toEqualTypeOf<Promise<void>>();
  });

  test("use は UseContext と next を受けて Promise<void> を返す", () => {
    // 実行と検証：
    expectTypeOf<ReadOnly["use"]>().parameter(0).toEqualTypeOf<IMiddleware.UseContext>();
    expectTypeOf<ReadOnly["use"]>().parameter(1).toEqualTypeOf<IMiddleware.INext>();
    expectTypeOf<ReadOnly["use"]>().returns.toEqualTypeOf<Promise<void>>();
  });

  test("name と isOpen の型を保持する", () => {
    // 準備：
    const transformer = new ReadOnly();

    // 実行と検証：
    expectTypeOf(transformer.name).toEqualTypeOf<string>();
    expectTypeOf(transformer.isOpen).toEqualTypeOf<boolean>();
    expectTypeOf(transformer.allowDelete).toEqualTypeOf<boolean>();
  });
});
