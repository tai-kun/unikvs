import type { MaybePromise } from "maypromise";
import { expectTypeOf, test } from "vitest";

import type {
  Context,
  IReadableStream,
  IStorage,
  ITransformer,
  IWritableStream,
} from "../src/index.js";

type AnyStorage = IStorage;
type BinaryStorage = IStorage<Uint8Array<ArrayBuffer>>;
type ObjectStorage = IStorage<{ readonly id: number }>;

type TestTransformer = ITransformer<
  string,
  Uint8Array<ArrayBuffer>,
  ArrayBuffer,
  Uint8Array<ArrayBuffer>
>;

test("IStorage は既定の型引数で任意のデータを読み書きできる", () => {
  expectTypeOf<AnyStorage["write"]>().parameter(0).toEqualTypeOf<IStorage.WriteArgs<any>>();
  expectTypeOf<AnyStorage["read"]>().returns.toEqualTypeOf<MaybePromise<any>>();
});

test("IStorage<T> の read は T を返す", () => {
  expectTypeOf<ObjectStorage["read"]>().returns.toEqualTypeOf<
    MaybePromise<{ readonly id: number }>
  >();
});

test("バイナリーデータを扱う IStorage はストリームチャンクにその型を使用する", () => {
  expectTypeOf<NonNullable<BinaryStorage["getWritable"]>>().returns.toEqualTypeOf<
    MaybePromise<IWritableStream<Uint8Array<ArrayBuffer>>>
  >();
  expectTypeOf<NonNullable<BinaryStorage["getReadable"]>>().returns.toEqualTypeOf<
    MaybePromise<IReadableStream<Uint8Array<ArrayBuffer>>>
  >();
});

test("バイナリー以外のデータを扱う IStorage のストリームチャンクは any にフォールバックする", () => {
  expectTypeOf<NonNullable<ObjectStorage["getWritable"]>>().returns.toEqualTypeOf<
    MaybePromise<IWritableStream<any>>
  >();
});

test("IStorage はストリーム取得メソッドを実装しなくてもよい", () => {
  expectTypeOf<AnyStorage["getWritable"]>().toExtend<
    ((args: IStorage.GetWritableArgs) => MaybePromise<IWritableStream<any>>) | undefined
  >();
});

test("ITransformer はエンコードとデコードそれぞれの入出力型を保持する", () => {
  expectTypeOf<TestTransformer["encode"]>()
    .parameter(0)
    .toEqualTypeOf<ITransformer.EncodeArgs<string>>();
  expectTypeOf<TestTransformer["encode"]>().returns.toEqualTypeOf<MaybePromise<ArrayBuffer>>();

  expectTypeOf<TestTransformer["decode"]>()
    .parameter(0)
    .toEqualTypeOf<ITransformer.DecodeArgs<Uint8Array<ArrayBuffer>>>();
  expectTypeOf<TestTransformer["decode"]>().returns.toEqualTypeOf<
    MaybePromise<Uint8Array<ArrayBuffer>>
  >();
});

test("Context のプロパティーへのアクセス結果は unknown である", () => {
  // 準備
  const context: Context = { "unikvs:key": "foo" };

  // 検証
  expectTypeOf(context["unikvs:key"]).toEqualTypeOf<unknown>();
});
