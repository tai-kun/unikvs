import type { IMiddleware } from "@unikvs/core";
import { test, describe, expectTypeOf } from "vite-plus/test";

import Tap, { type TapContext, type TapCallback } from "../src/tap.js";

describe("Tap の型", () => {
  test("Tap は IMiddleware として扱える", () => {
    expectTypeOf<Tap>().toExtend<IMiddleware>();
  });

  test("コンストラクターの第一引数は TapCallback である", () => {
    expectTypeOf<ConstructorParameters<typeof Tap>[0]>().toEqualTypeOf<TapCallback>();
  });

  test("TapCallback は TapContext を受け取る", () => {
    expectTypeOf<TapCallback>().parameter(0).toEqualTypeOf<TapContext>();
    expectTypeOf<TapCallback>().returns.toEqualTypeOf<void | Promise<void>>();
  });

  test("TapContext はデータを扱う 4 つのコンテキストを含む", () => {
    expectTypeOf<IMiddleware.EncodeContext>().toExtend<TapContext>();
    expectTypeOf<IMiddleware.DecodeContext>().toExtend<TapContext>();
    expectTypeOf<IMiddleware.EncodeStreamContext>().toExtend<TapContext>();
    expectTypeOf<IMiddleware.DecodeStreamContext>().toExtend<TapContext>();
  });

  test("name は string、isOpen は boolean を返す", () => {
    // 準備：
    const tap = new Tap(() => {});

    // 実行と検証：
    expectTypeOf(tap.name).toEqualTypeOf<string>();
    expectTypeOf(tap.isOpen).toEqualTypeOf<boolean>();
  });
});
