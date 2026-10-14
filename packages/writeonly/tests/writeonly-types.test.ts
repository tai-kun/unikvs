import type { ITransformer } from "@unikvs/core";
import { expectTypeOf, test } from "vitest";

import WriteOnly, { type WriteOnlyOptions } from "../src/write-only.js";

test("WriteOnly は ITransformer として扱える", () => {
  expectTypeOf<WriteOnly>().toExtend<ITransformer>();
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

test("encode はデータの型をそのまま戻り値にする", () => {
  // 準備
  const transformer = new WriteOnly();

  // 実行と検証
  expectTypeOf(transformer.encode<string>({ data: "hello" })).toEqualTypeOf<string>();
  expectTypeOf(transformer.encode({ data: 123 })).toEqualTypeOf<number>();
  expectTypeOf(transformer.encode({ data: { id: 1 } })).toEqualTypeOf<{ id: number }>();
});

test("decode と getDecodable と onExists の戻り値は never である", () => {
  // 準備
  const transformer = new WriteOnly();

  // 実行と検証
  expectTypeOf<typeof transformer.decode>().returns.toBeNever();
  expectTypeOf<typeof transformer.getDecodable>().returns.toBeNever();
  expectTypeOf<typeof transformer.onExists>().returns.toBeNever();
});

test("getEncodable は TransformStream を返す", () => {
  // 準備
  const transformer = new WriteOnly();

  // 実行と検証
  expectTypeOf(transformer.getEncodable()).toEqualTypeOf<TransformStream<any, any>>();
});

test("name と allowDelete と isOpen の型を保持する", () => {
  // 準備
  const transformer = new WriteOnly();

  // 実行と検証
  expectTypeOf(transformer.name).toEqualTypeOf<string>();
  expectTypeOf(transformer.allowDelete).toEqualTypeOf<boolean>();
  expectTypeOf(transformer.isOpen).toEqualTypeOf<boolean>();
});
