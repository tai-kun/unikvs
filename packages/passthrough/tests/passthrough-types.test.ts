import type { ITransformer } from "@unikvs/core";
import { expectTypeOf, test } from "vitest";

import PassThrough from "../src/passthrough.js";

test("PassThrough は ITransformer として扱える", () => {
  expectTypeOf<PassThrough>().toExtend<ITransformer>();
});

test("encode はデータの型をそのまま戻り値にする", () => {
  // 準備
  const passthrough = new PassThrough();

  // 実行と検証
  expectTypeOf(passthrough.encode<string>({ data: "hello" })).toEqualTypeOf<string>();
  expectTypeOf(passthrough.encode({ data: 123 })).toEqualTypeOf<number>();
  expectTypeOf(passthrough.encode({ data: { id: 1 } })).toEqualTypeOf<{ id: number }>();
});

test("decode はデータの型をそのまま戻り値にする", () => {
  // 準備
  const passthrough = new PassThrough();

  // 実行と検証
  expectTypeOf(passthrough.decode<string>({ data: "hello" })).toEqualTypeOf<string>();
  expectTypeOf(passthrough.decode({ data: 123 })).toEqualTypeOf<number>();
  expectTypeOf(passthrough.decode({ data: new Uint8Array([1]) })).toEqualTypeOf<
    Uint8Array<ArrayBuffer>
  >();
});

test("getEncodable と getDecodable は TransformStream を返す", () => {
  // 準備
  const passthrough = new PassThrough();

  // 実行と検証
  expectTypeOf(passthrough.getEncodable()).toEqualTypeOf<TransformStream<any, any>>();
  expectTypeOf(passthrough.getDecodable()).toEqualTypeOf<TransformStream<any, any>>();
});

test("name は string、isOpen は boolean を返す", () => {
  // 準備
  const passthrough = new PassThrough();

  // 実行と検証
  expectTypeOf(passthrough.name).toEqualTypeOf<string>();
  expectTypeOf(passthrough.isOpen).toEqualTypeOf<boolean>();
});
