import type { IMiddleware } from "@unikvs/core";
import { expectTypeOf, test } from "vitest";

import AllowRepair from "../src/allow-repair.js";

test("AllowRepair は IMiddleware として扱える", () => {
  expectTypeOf<AllowRepair>().toExtend<IMiddleware>();
});

test("コンストラクターは引数なしで組み立てられる", () => {
  // 準備と実行
  const gate = new AllowRepair();

  // 検証
  expectTypeOf(gate.enabled).toEqualTypeOf<boolean>();
  // @ts-expect-error 引数なしのみが正規であり余剰引数は受け付けません。
  expectTypeOf(new AllowRepair({})).toEqualTypeOf<AllowRepair>();
});

test("use はコンテキストと next を受けて Promise<void> を返す", () => {
  // 実行と検証
  expectTypeOf<AllowRepair["use"]>().parameter(0).toEqualTypeOf<IMiddleware.UseContext>();
  expectTypeOf<AllowRepair["use"]>().parameter(1).toEqualTypeOf<IMiddleware.INext>();
  expectTypeOf<AllowRepair["use"]>().returns.toEqualTypeOf<Promise<void>>();
});

test("encode と decode はコンテキストと next を受けて Promise<void> を返す", () => {
  // 実行と検証
  expectTypeOf<AllowRepair["encode"]>()
    .parameter(0)
    .toEqualTypeOf<IMiddleware.EncodeContext<unknown, unknown>>();
  expectTypeOf<AllowRepair["encode"]>().parameter(1).toEqualTypeOf<IMiddleware.INext>();
  expectTypeOf<AllowRepair["encode"]>().returns.toEqualTypeOf<Promise<void>>();
  expectTypeOf<AllowRepair["decode"]>()
    .parameter(0)
    .toEqualTypeOf<IMiddleware.DecodeContext<unknown, unknown>>();
  expectTypeOf<AllowRepair["decode"]>().parameter(1).toEqualTypeOf<IMiddleware.INext>();
  expectTypeOf<AllowRepair["decode"]>().returns.toEqualTypeOf<Promise<void>>();
});

test("encodeStream と decodeStream はコンテキストと next を受けて Promise<void> を返す", () => {
  // 実行と検証
  expectTypeOf<AllowRepair["encodeStream"]>()
    .parameter(0)
    .toEqualTypeOf<IMiddleware.EncodeStreamContext<unknown, unknown>>();
  expectTypeOf<AllowRepair["encodeStream"]>().parameter(1).toEqualTypeOf<IMiddleware.INext>();
  expectTypeOf<AllowRepair["encodeStream"]>().returns.toEqualTypeOf<Promise<void>>();
  expectTypeOf<AllowRepair["decodeStream"]>()
    .parameter(0)
    .toEqualTypeOf<IMiddleware.DecodeStreamContext<unknown, unknown>>();
  expectTypeOf<AllowRepair["decodeStream"]>().parameter(1).toEqualTypeOf<IMiddleware.INext>();
  expectTypeOf<AllowRepair["decodeStream"]>().returns.toEqualTypeOf<Promise<void>>();
});

test("name と enabled と isOpen の型を保持する", () => {
  // 準備
  const gate = new AllowRepair();

  // 実行と検証
  expectTypeOf(gate.name).toEqualTypeOf<string>();
  expectTypeOf(gate.enabled).toEqualTypeOf<boolean>();
  expectTypeOf(gate.isOpen).toEqualTypeOf<boolean>();
  expectTypeOf(gate.toggle()).toEqualTypeOf<boolean>();
});
