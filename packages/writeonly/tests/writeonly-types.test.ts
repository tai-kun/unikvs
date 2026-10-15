import type { IMiddleware } from "@unikvs/core";
import { expectTypeOf, test } from "vitest";

import WriteOnly, { type WriteOnlyOptions } from "../src/write-only.js";

test("WriteOnly は IMiddleware として扱える", () => {
  expectTypeOf<WriteOnly>().toExtend<IMiddleware>();
});

test("コンストラクターはオプションなし・ありで組み立てられる", () => {
  // 実行と検証
  expectTypeOf(new WriteOnly()).toEqualTypeOf<WriteOnly>();
  expectTypeOf(new WriteOnly({})).toEqualTypeOf<WriteOnly>();
  expectTypeOf(new WriteOnly(undefined)).toEqualTypeOf<WriteOnly>();
  expectTypeOf(new WriteOnly({ allowDelete: undefined })).toEqualTypeOf<WriteOnly>();
  expectTypeOf(new WriteOnly({ allowDelete: false })).toEqualTypeOf<WriteOnly>();
  expectTypeOf(new WriteOnly({ allowDelete: true })).toEqualTypeOf<WriteOnly>();
});

test("options の余剰プロパティーは受け付けない", () => {
  // 実行と検証
  expectTypeOf({} as WriteOnlyOptions).toEqualTypeOf<WriteOnlyOptions>();
  expectTypeOf({ allowDelete: "yes" })
    // @ts-expect-error 真偽値のみが正規であり、文字列は受け付けません。
    .toEqualTypeOf<WriteOnlyOptions>();
});

test("encode はコンテキストと next を受けて Promise<void> を返す", () => {
  // 実行と検証
  expectTypeOf<WriteOnly["encode"]>().parameter(0).toEqualTypeOf<IMiddleware.EncodeContext>();
  expectTypeOf<WriteOnly["encode"]>().parameter(1).toEqualTypeOf<IMiddleware.INext>();
  expectTypeOf<WriteOnly["encode"]>().returns.toEqualTypeOf<Promise<void>>();
});

test("decode は DecodeContext を受けて Promise<void> を返す", () => {
  // 実行と検証
  expectTypeOf<WriteOnly["decode"]>().parameter(0).toEqualTypeOf<IMiddleware.DecodeContext>();
  expectTypeOf<WriteOnly["decode"]>().returns.toEqualTypeOf<Promise<void>>();
});

test("encodeStream と decodeStream の引数と戻り値の型を保持する", () => {
  // 実行と検証
  expectTypeOf<WriteOnly["encodeStream"]>()
    .parameter(0)
    .toEqualTypeOf<IMiddleware.EncodeStreamContext>();
  expectTypeOf<WriteOnly["encodeStream"]>().parameter(1).toEqualTypeOf<IMiddleware.INext>();
  expectTypeOf<WriteOnly["encodeStream"]>().returns.toEqualTypeOf<Promise<void>>();
  expectTypeOf<WriteOnly["decodeStream"]>()
    .parameter(0)
    .toEqualTypeOf<IMiddleware.DecodeStreamContext>();
  expectTypeOf<WriteOnly["decodeStream"]>().returns.toEqualTypeOf<Promise<void>>();
});

test("use は UseContext と next を受けて Promise<void> を返す", () => {
  // 実行と検証
  expectTypeOf<WriteOnly["use"]>().parameter(0).toEqualTypeOf<IMiddleware.UseContext>();
  expectTypeOf<WriteOnly["use"]>().parameter(1).toEqualTypeOf<IMiddleware.INext>();
  expectTypeOf<WriteOnly["use"]>().returns.toEqualTypeOf<Promise<void>>();
});

test("name と allowDelete と isOpen の型を保持する", () => {
  // 準備
  const transformer = new WriteOnly();

  // 実行と検証
  expectTypeOf(transformer.name).toEqualTypeOf<string>();
  expectTypeOf(transformer.allowDelete).toEqualTypeOf<boolean>();
  expectTypeOf(transformer.isOpen).toEqualTypeOf<boolean>();
});
