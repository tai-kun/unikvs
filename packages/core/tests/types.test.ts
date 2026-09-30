import type { MaybePromise } from "maypromise";
import { expectTypeOf, test } from "vitest";

import {
  ErrorBase,
  InvalidUsageErrorBase,
  setErrorMessage,
  type ErrorMeta,
  type ErrorOptions,
  type IEncodable,
  type IDecodable,
  type IReadableStream,
  type IStorage,
  type ITransformer,
  type IWritableStream,
  type Variables,
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

type FoursomeStorage = IStorage<Uint8Array<ArrayBuffer>, string, ArrayBuffer, number>;
type ChunkDefaultStorage = IStorage<Uint8Array<ArrayBuffer>, string, ArrayBuffer>;

type FullTransformer = ITransformer<
  string,
  number,
  boolean,
  Date,
  Uint8Array<ArrayBuffer>,
  string,
  ArrayBuffer,
  number
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

test("Variables のプロパティーへのアクセス結果は unknown である", () => {
  // 準備
  const vars: Variables = { "unikvs:key": "foo" };

  // 検証
  expectTypeOf(vars["unikvs:key"]).toEqualTypeOf<unknown>();
});

test("Variables は string キーと unknown 値のレコードである", () => {
  // 実行と検証
  expectTypeOf<Variables>().toEqualTypeOf<Record<string, unknown>>();
});

test("IStorage の name と isOpen は必須のプロパティーである", () => {
  // 実行と検証
  expectTypeOf<AnyStorage["name"]>().toEqualTypeOf<string>();
  expectTypeOf<AnyStorage["isOpen"]>().toEqualTypeOf<boolean>();
});

test("IStorage の CRUD メソッドは必須である", () => {
  // 実行と検証
  expectTypeOf<AnyStorage["write"]>().returns.toEqualTypeOf<MaybePromise<void>>();
  expectTypeOf<AnyStorage["exists"]>().returns.toEqualTypeOf<MaybePromise<boolean>>();
  expectTypeOf<AnyStorage["delete"]>().returns.toEqualTypeOf<MaybePromise<void>>();
  expectTypeOf<AnyStorage["clear"]>().returns.toEqualTypeOf<MaybePromise<void>>();
  expectTypeOf<Omit<AnyStorage, "read">>().not.toExtend<AnyStorage>();
});

test("IStorage のライフサイクルメソッドは省略できる", () => {
  // 実行と検証
  expectTypeOf<AnyStorage["open"]>().toEqualTypeOf<
    ((args: IStorage.OpenArgs) => MaybePromise<void>) | undefined
  >();
  expectTypeOf<AnyStorage["close"]>().toEqualTypeOf<
    ((args: IStorage.CloseArgs) => MaybePromise<void>) | undefined
  >();
  expectTypeOf<AnyStorage["onOtherWriteError"]>().toEqualTypeOf<
    ((args: IStorage.OnOtherWriteErrorArgs) => MaybePromise<void>) | undefined
  >();
});

test("IStorage のストリーム取得メソッドは Partial で省略可能である", () => {
  // 実行と検証
  expectTypeOf<AnyStorage["getWritable"]>().toEqualTypeOf<
    ((args: IStorage.GetWritableArgs) => MaybePromise<IWritableStream<any>>) | undefined
  >();
  expectTypeOf<AnyStorage["getReadable"]>().toEqualTypeOf<
    ((args: IStorage.GetReadableArgs) => MaybePromise<IReadableStream<any>>) | undefined
  >();
});

test("IStorage は 4 つの型引数すべてを指定できる", () => {
  // 実行と検証
  expectTypeOf<FoursomeStorage["write"]>()
    .parameter(0)
    .toEqualTypeOf<IStorage.WriteArgs<Uint8Array<ArrayBuffer>>>();
  expectTypeOf<FoursomeStorage["read"]>().returns.toEqualTypeOf<MaybePromise<string>>();
  expectTypeOf<NonNullable<FoursomeStorage["getWritable"]>>().returns.toEqualTypeOf<
    MaybePromise<IWritableStream<ArrayBuffer>>
  >();
  expectTypeOf<NonNullable<FoursomeStorage["getReadable"]>>().returns.toEqualTypeOf<
    MaybePromise<IReadableStream<number>>
  >();
});

test("IStorage の TReadChunkOutput の既定値は TWriteChunkInput である", () => {
  // 実行と検証
  expectTypeOf<NonNullable<ChunkDefaultStorage["getReadable"]>>().returns.toEqualTypeOf<
    MaybePromise<IReadableStream<ArrayBuffer>>
  >();
});

test("IStorage.Key は string である", () => {
  // 実行と検証
  expectTypeOf<IStorage.Key>().toEqualTypeOf<string>();
});

test("IStorage の CRUD 引数は vars と key と signal を持つ", () => {
  // 実行と検証
  expectTypeOf<IStorage.WriteArgs<{ readonly id: number }>>().toEqualTypeOf<{
    vars: Variables;
    key: IStorage.Key;
    data: { readonly id: number };
    signal: AbortSignal;
  }>();
  expectTypeOf<IStorage.ReadArgs>().toEqualTypeOf<IStorage.ExistsArgs>();
  expectTypeOf<IStorage.ReadArgs>().toEqualTypeOf<IStorage.DeleteArgs>();
});

test("IStorage の ClearArgs は key を持たない", () => {
  // 実行と検証
  expectTypeOf<IStorage.ClearArgs>().toEqualTypeOf<{
    vars: Variables;
    signal: AbortSignal;
  }>();
});

test("IStorage のストリーム取得引数は vars と key と signal を持つ", () => {
  // 実行と検証
  expectTypeOf<IStorage.GetWritableArgs>().toEqualTypeOf<IStorage.GetReadableArgs>();
  expectTypeOf<IStorage.GetWritableArgs>().toEqualTypeOf<{
    vars: Variables;
    key: IStorage.Key;
    signal: AbortSignal;
  }>();
});

test("IStorage のライフサイクル引数は vars と signal を持つ", () => {
  // 実行と検証
  expectTypeOf<IStorage.OpenArgs>().toEqualTypeOf<IStorage.CloseArgs>();
  expectTypeOf<IStorage.OpenArgs>().toEqualTypeOf<{
    vars: Variables;
    signal: AbortSignal;
  }>();
});

test("IStorage.onOtherWriteError の引数は集約エラーとして ErrorBase を保持する", () => {
  // 実行と検証
  expectTypeOf<IStorage.OnOtherWriteErrorArgs["error"]>().toEqualTypeOf<
    ErrorBase<{
      readonly plugin: "storage";
      readonly action: "write";
      readonly errors: readonly {
        readonly plugin: "storage";
        readonly reason: unknown;
      }[];
    }>
  >();
});

test("IWritableStream と IReadableStream は標準のストリームを継承する", () => {
  // 実行と検証
  expectTypeOf<IWritableStream<Uint8Array<ArrayBuffer>>>().toExtend<
    WritableStream<Uint8Array<ArrayBuffer>>
  >();
  expectTypeOf<IReadableStream<Uint8Array<ArrayBuffer>>>().toExtend<
    ReadableStream<Uint8Array<ArrayBuffer>>
  >();
});

test("ITransformer の 8 つの型引数は順番どおりに反映される", () => {
  // 実行と検証
  expectTypeOf<FullTransformer["encode"]>()
    .parameter(0)
    .toEqualTypeOf<ITransformer.EncodeArgs<string>>();
  expectTypeOf<FullTransformer["encode"]>().returns.toEqualTypeOf<MaybePromise<boolean>>();

  expectTypeOf<FullTransformer["decode"]>()
    .parameter(0)
    .toEqualTypeOf<ITransformer.DecodeArgs<number>>();
  expectTypeOf<FullTransformer["decode"]>().returns.toEqualTypeOf<MaybePromise<Date>>();

  expectTypeOf<NonNullable<FullTransformer["getEncodable"]>>().returns.toEqualTypeOf<
    MaybePromise<IEncodable<Uint8Array<ArrayBuffer>, ArrayBuffer>>
  >();
  expectTypeOf<NonNullable<FullTransformer["getDecodable"]>>().returns.toEqualTypeOf<
    MaybePromise<IDecodable<string, number>>
  >();
});

test("ITransformer の encode と decode は必須である", () => {
  // 実行と検証
  expectTypeOf<Omit<FullTransformer, "encode">>().not.toExtend<FullTransformer>();
  expectTypeOf<Omit<FullTransformer, "decode">>().not.toExtend<FullTransformer>();
});

test("ITransformer のストリーム変換メソッドは Partial で省略可能である", () => {
  // 実行と検証
  expectTypeOf<FullTransformer["getEncodable"]>().toEqualTypeOf<
    | ((
        args: ITransformer.GetEncodableArgs,
      ) => MaybePromise<IEncodable<Uint8Array<ArrayBuffer>, ArrayBuffer>>)
    | undefined
  >();
  expectTypeOf<FullTransformer["getDecodable"]>().toEqualTypeOf<
    ((args: ITransformer.GetDecodableArgs) => MaybePromise<IDecodable<string, number>>) | undefined
  >();
});

test("ITransformer の単発変換引数は vars と data と signal を持つ", () => {
  // 実行と検証
  expectTypeOf<ITransformer.EncodeArgs<{ readonly id: number }>>().toEqualTypeOf<{
    vars: Variables;
    data: { readonly id: number };
    signal: AbortSignal;
  }>();
  expectTypeOf<ITransformer.DecodeArgs<{ readonly id: number }>>().toEqualTypeOf<
    ITransformer.EncodeArgs<{ readonly id: number }>
  >();
});

test("ITransformer のストリーム変換引数は vars と signal を持つ", () => {
  // 実行と検証
  expectTypeOf<ITransformer.GetEncodableArgs>().toEqualTypeOf<ITransformer.GetDecodableArgs>();
  expectTypeOf<ITransformer.GetEncodableArgs>().toEqualTypeOf<{
    vars: Variables;
    signal: AbortSignal;
  }>();
});

test("ITransformer のライフサイクル引数は vars と signal を持つ", () => {
  // 実行と検証
  expectTypeOf<ITransformer.OpenArgs>().toEqualTypeOf<ITransformer.CloseArgs>();
  expectTypeOf<ITransformer.OpenArgs>().toEqualTypeOf<{
    vars: Variables;
    signal: AbortSignal;
  }>();
});

test("IEncodable と IDecodable は TransformStream を継承する", () => {
  // 実行と検証
  expectTypeOf<IEncodable<string, number>>().toExtend<TransformStream<string, number>>();
  expectTypeOf<IDecodable<string, number>>().toExtend<TransformStream<string, number>>();
});

test("ErrorMeta は文字列キーと unknown 値の読み取り専用オブジェクトである", () => {
  // 実行と検証
  expectTypeOf<ErrorMeta>().toEqualTypeOf<{ readonly [prop: string]: unknown }>();
});

test("ErrorOptions は cause を保持できる", () => {
  // 実行と検証
  expectTypeOf<ErrorOptions>().toHaveProperty("cause");
  expectTypeOf<ErrorOptions["cause"]>().toEqualTypeOf<unknown>();
});

test("ErrorBase の型引数の既定値は ErrorMeta | undefined である", () => {
  // 実行と検証
  expectTypeOf<ErrorBase>().toEqualTypeOf<ErrorBase<ErrorMeta | undefined>>();
});

test("ErrorBase は型引数を省略すると meta から型引数を推論する", () => {
  // 実行と検証
  expectTypeOf(new ErrorBase({ code: 1 }, "message")).toEqualTypeOf<ErrorBase<{ code: number }>>();
  expectTypeOf(new ErrorBase<undefined>("message")).toEqualTypeOf<ErrorBase<undefined>>();
});

test("ErrorBase は型引数で指定した meta を受け取る", () => {
  // 準備
  type Meta = { readonly code: number };

  // 実行と検証
  expectTypeOf(new ErrorBase<Meta>({ code: 1 }, "message")).toEqualTypeOf<ErrorBase<Meta>>();
});

test("InvalidUsageErrorBase は ErrorBase と同じコンストラクター形式を受け取る", () => {
  // 準備
  type Meta = { readonly actual: unknown };

  // 実行と検証
  expectTypeOf(new InvalidUsageErrorBase<Meta>({ actual: null }, "message")).toEqualTypeOf<
    InvalidUsageErrorBase<Meta>
  >();
});

/**
 * 型エラーの検証専用で、実行時には呼び出されない関数です。
 * 不正な使用がコンパイルエラーになることを確認するために使用します。
 */
function expectTypeErrors(): void {
  // @ts-expect-error TMeta が undefined でないためメッセージのみの形式は使えない
  new ErrorBase<{ readonly code: number }>("message");

  // @ts-expect-error meta の型が合わない
  new ErrorBase<{ readonly code: number }>({ code: "not a number" }, "message");

  // @ts-expect-error I18nErrorBase を継承していないクラスへは登録できない
  setErrorMessage(globalThis.Error, "message", "ja");

  // @ts-expect-error メッセージは文字列かメッセージ関数でなければならない
  setErrorMessage(ErrorBase, 42, "ja");

  // @ts-expect-error read を省略した型は IStorage を満たさない
  const incompleteStorage: IStorage = {} as Omit<IStorage, "read">;

  // @ts-expect-error encode を省略した型は ITransformer を満たさない
  const incompleteTransformer: ITransformer = {} as Omit<ITransformer, "encode">;

  void incompleteStorage;
  void incompleteTransformer;
}

test("不正な使用はコンパイルエラーになる", () => {
  // 実行と検証
  expectTypeOf(expectTypeErrors).toBeFunction();
});
