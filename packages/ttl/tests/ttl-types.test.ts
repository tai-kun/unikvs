import type { IMiddleware } from "@unikvs/core";
import { test, describe, expectTypeOf } from "vite-plus/test";

import Ttl, { type TtlInput } from "../src/ttl.js";

describe("型", () => {
  test("Ttl は IMiddleware として扱える", () => {
    expectTypeOf<Ttl>().toExtend<IMiddleware>();
  });

  test("コンストラクターはオプションなし・ありで組み立てられる", () => {
    // 実行と検証：
    expectTypeOf(new Ttl()).toEqualTypeOf<Ttl>();
    expectTypeOf(new Ttl({})).toEqualTypeOf<Ttl>();
    expectTypeOf(new Ttl(undefined)).toEqualTypeOf<Ttl>();
    expectTypeOf(new Ttl({ defaultTtl: 60 })).toEqualTypeOf<Ttl>();
    expectTypeOf(new Ttl({ defaultTtl: new Date() })).toEqualTypeOf<Ttl>();
    expectTypeOf(new Ttl({ defaultTtl: { ttl: 60 } })).toEqualTypeOf<Ttl>();
    expectTypeOf(new Ttl({ now: (): number => Date.now() })).toEqualTypeOf<Ttl>();
  });

  test("TtlInput は相対秒数・絶対時刻・オブジェクト形式を受け付ける", () => {
    // 実行と検証：
    expectTypeOf(60).toExtend<TtlInput>();
    expectTypeOf(new Date()).toExtend<TtlInput>();
    expectTypeOf({ ttl: 60 }).toExtend<TtlInput>();
    expectTypeOf({ expiresAt: Date.now() }).toExtend<TtlInput>();
    expectTypeOf("60").not.toExtend<TtlInput>();
  });

  test("encode はコンテキストと next を受けて Promise<void> を返す", () => {
    // 実行と検証：
    expectTypeOf<Ttl["encode"]>().parameter(0).toEqualTypeOf<IMiddleware.EncodeContext>();
    expectTypeOf<Ttl["encode"]>().parameter(1).toEqualTypeOf<IMiddleware.INext>();
    expectTypeOf<Ttl["encode"]>().returns.toEqualTypeOf<Promise<void>>();
  });

  test("decode は DecodeContext を受けて Promise<void> を返す", () => {
    // 実行と検証：
    expectTypeOf<Ttl["decode"]>().parameter(0).toEqualTypeOf<IMiddleware.DecodeContext>();
    expectTypeOf<Ttl["decode"]>().returns.toEqualTypeOf<Promise<void>>();
  });

  test("encodeStream と decodeStream の引数と戻り値の型を保持する", () => {
    // 実行と検証：
    expectTypeOf<Ttl["encodeStream"]>()
      .parameter(0)
      .toEqualTypeOf<IMiddleware.EncodeStreamContext>();
    expectTypeOf<Ttl["encodeStream"]>().parameter(1).toEqualTypeOf<IMiddleware.INext>();
    expectTypeOf<Ttl["encodeStream"]>().returns.toEqualTypeOf<Promise<void>>();
    expectTypeOf<Ttl["decodeStream"]>()
      .parameter(0)
      .toEqualTypeOf<IMiddleware.DecodeStreamContext>();
    expectTypeOf<Ttl["decodeStream"]>().parameter(1).toEqualTypeOf<IMiddleware.INext>();
    expectTypeOf<Ttl["decodeStream"]>().returns.toEqualTypeOf<Promise<void>>();
  });

  test("use と mapKey の引数と戻り値の型を保持する", () => {
    // 実行と検証：
    expectTypeOf<Ttl["use"]>().parameter(0).toEqualTypeOf<IMiddleware.UseContext>();
    expectTypeOf<Ttl["use"]>().parameter(1).toEqualTypeOf<IMiddleware.INext>();
    expectTypeOf<Ttl["use"]>().returns.toEqualTypeOf<Promise<void>>();
    expectTypeOf<Ttl["mapKey"]>().parameter(0).toEqualTypeOf<IMiddleware.MapKeyContext>();
    expectTypeOf<Ttl["mapKey"]>().returns.toEqualTypeOf<string>();
  });

  test("afterUse は UseOutcome を受けて Promise<void> を返す", () => {
    // 実行と検証：
    expectTypeOf<Ttl["afterUse"]>().parameter(0).toEqualTypeOf<IMiddleware.UseContext>();
    expectTypeOf<Ttl["afterUse"]>().parameter(1).toEqualTypeOf<IMiddleware.UseOutcome>();
    expectTypeOf<Ttl["afterUse"]>().returns.toEqualTypeOf<Promise<void>>();
  });
});
