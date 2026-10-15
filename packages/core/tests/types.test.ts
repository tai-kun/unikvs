import type { MaybePromise } from "maypromise";
import { expectTypeOf, test } from "vitest";

import {
  ErrorBase,
  InvalidUsageErrorBase,
  setErrorMessage,
  type ErrorMeta,
  type ErrorOptions,
  type IActionContext,
  type IClearContext,
  type ICloseContext,
  type IDecodeContext,
  type IDecodeStreamContext,
  type IDeleteContext,
  type IEncodeContext,
  type IEncodeStreamContext,
  type IGetContext,
  type IHasContext,
  type IKeyedActionContext,
  type ILifecycleContext,
  type IMapKeyContext,
  type IMiddleware,
  type IOpenContext,
  type IPipelineContext,
  type IReadableStream,
  type IRepairContext,
  type ISetContext,
  type IStorage,
  type IStreamContext,
  type ITransformStream,
  type IWritableStream,
} from "../src/index.js";

type AnyStorage = IStorage;
type BinaryStorage = IStorage<Uint8Array<ArrayBuffer>>;
type ObjectStorage = IStorage<{ readonly id: number }>;

type FoursomeStorage = IStorage<Uint8Array<ArrayBuffer>, string, ArrayBuffer, number>;
type ChunkDefaultStorage = IStorage<Uint8Array<ArrayBuffer>, string, ArrayBuffer>;

test("IStorage の name と isOpen は必須のプロパティーである", () => {
  // 実行と検証
  expectTypeOf<AnyStorage["name"]>().toEqualTypeOf<string>();
  expectTypeOf<AnyStorage["isOpen"]>().toEqualTypeOf<boolean>();
});

test("IStorage の CRUD メソッドは必須である", () => {
  // 実行と検証
  expectTypeOf<AnyStorage["write"]>().returns.toEqualTypeOf<MaybePromise<void>>();
  expectTypeOf<AnyStorage["read"]>().returns.toEqualTypeOf<MaybePromise<any>>();
  expectTypeOf<AnyStorage["exists"]>().returns.toEqualTypeOf<MaybePromise<boolean>>();
  expectTypeOf<AnyStorage["delete"]>().returns.toEqualTypeOf<MaybePromise<void>>();
  expectTypeOf<AnyStorage["clear"]>().returns.toEqualTypeOf<MaybePromise<void>>();
});

test("IStorage の write はコンテキストとデータを受け取る", () => {
  // 実行と検証
  expectTypeOf<AnyStorage["write"]>()
    .parameter(0)
    .toEqualTypeOf<
      IStorage["write"] extends (c: infer C, ...rest: never[]) => unknown ? C : never
    >();
  expectTypeOf<ObjectStorage["read"]>().returns.toEqualTypeOf<
    MaybePromise<{ readonly id: number }>
  >();
});

test("IStorage の read は型引数を返す", () => {
  // 実行と検証
  expectTypeOf<ObjectStorage["read"]>().returns.toEqualTypeOf<
    MaybePromise<{ readonly id: number }>
  >();
  expectTypeOf<BinaryStorage["read"]>().returns.toEqualTypeOf<
    MaybePromise<Uint8Array<ArrayBuffer>>
  >();
});

test("IStorage のストリームチャンクは既定で any である", () => {
  // 実行と検証
  expectTypeOf<NonNullable<BinaryStorage["getWritable"]>>().returns.toEqualTypeOf<
    MaybePromise<IWritableStream<any>>
  >();
  expectTypeOf<NonNullable<BinaryStorage["getReadable"]>>().returns.toEqualTypeOf<
    MaybePromise<IReadableStream<any>>
  >();
});

test("IStorage のライフサイクルとストリーム取得は省略できる", () => {
  // 実行と検証
  expectTypeOf<AnyStorage["open"]>().toEqualTypeOf<
    ((c: IStorage.OpenContext) => MaybePromise<void>) | undefined
  >();
  expectTypeOf<AnyStorage["close"]>().toEqualTypeOf<
    ((c: IStorage.CloseContext) => MaybePromise<void>) | undefined
  >();
  expectTypeOf<AnyStorage["onOtherWriteError"]>().toEqualTypeOf<
    | ((
        c: IStorage.OtherWriteErrorHandlerContext,
        errors: readonly IStorage.IOtherWriteError[],
      ) => MaybePromise<void>)
    | undefined
  >();
  expectTypeOf<AnyStorage["getWritable"]>().toEqualTypeOf<
    ((c: IStorage.GetWritableContext) => MaybePromise<IWritableStream<any>>) | undefined
  >();
  expectTypeOf<AnyStorage["getReadable"]>().toEqualTypeOf<
    ((c: IStorage.GetReadableContext) => MaybePromise<IReadableStream<any>>) | undefined
  >();
});

test("IStorage は 4 つの型引数すべてを指定できる", () => {
  // 実行と検証
  expectTypeOf<FoursomeStorage["write"]>().parameter(1).toEqualTypeOf<Uint8Array<ArrayBuffer>>();
  expectTypeOf<FoursomeStorage["read"]>().returns.toEqualTypeOf<MaybePromise<string>>();
  expectTypeOf<NonNullable<FoursomeStorage["getWritable"]>>().returns.toEqualTypeOf<
    MaybePromise<IWritableStream<ArrayBuffer>>
  >();
  expectTypeOf<NonNullable<FoursomeStorage["getReadable"]>>().returns.toEqualTypeOf<
    MaybePromise<IReadableStream<number>>
  >();
});

test("IStorage の TReadChunk の既定値は TWriteChunk である", () => {
  // 実行と検証
  expectTypeOf<NonNullable<ChunkDefaultStorage["getReadable"]>>().returns.toEqualTypeOf<
    MaybePromise<IReadableStream<ArrayBuffer>>
  >();
});

test("IStorage のコンテキスト別名は pipeline-context と一致する", () => {
  // 実行と検証
  expectTypeOf<IStorage.OpenContext>().toEqualTypeOf<IOpenContext>();
  expectTypeOf<IStorage.CloseContext>().toEqualTypeOf<ICloseContext>();
  expectTypeOf<IStorage.WriteContext>().toEqualTypeOf<ISetContext | IRepairContext>();
  expectTypeOf<IStorage.GetWritableContext>().toEqualTypeOf<ISetContext | IRepairContext>();
  expectTypeOf<IStorage.ReadContext>().toEqualTypeOf<IGetContext>();
  expectTypeOf<IStorage.GetReadableContext>().toEqualTypeOf<IStreamContext>();
  expectTypeOf<IStorage.ExistsContext>().toEqualTypeOf<IHasContext>();
  expectTypeOf<IStorage.DeleteContext>().toEqualTypeOf<IDeleteContext>();
  expectTypeOf<IStorage.ClearContext>().toEqualTypeOf<IClearContext>();
});

test("IStorage の OtherWriteError はプラグイン名と理由を保持する", () => {
  // 実行と検証
  expectTypeOf<IStorage.IOtherWriteError["plugin"]>().toEqualTypeOf<"storage">();
  expectTypeOf<IStorage.IOtherWriteError["errors"]>().toEqualTypeOf<
    readonly {
      readonly plugin: "storage";
      readonly reason: unknown;
    }[]
  >();
});

test("IMiddleware の name と isOpen は必須のプロパティーである", () => {
  // 実行と検証
  expectTypeOf<IMiddleware["name"]>().toEqualTypeOf<string>();
  expectTypeOf<IMiddleware["isOpen"]>().toEqualTypeOf<boolean>();
});

test("IMiddleware のフックは省略できる", () => {
  // 実行と検証
  expectTypeOf<IMiddleware["mapKey"]>().toEqualTypeOf<
    ((c: IMiddleware.MapKeyContext) => string) | undefined
  >();
  expectTypeOf<IMiddleware["open"]>().toEqualTypeOf<
    ((c: IMiddleware.OpenContext) => MaybePromise<void>) | undefined
  >();
  expectTypeOf<IMiddleware["close"]>().toEqualTypeOf<
    ((c: IMiddleware.CloseContext) => MaybePromise<void>) | undefined
  >();
  expectTypeOf<IMiddleware["use"]>().toEqualTypeOf<
    ((c: IMiddleware.UseContext, next: IMiddleware.INext) => PromiseLike<void>) | undefined
  >();
});

test("IMiddleware のコンテキスト別名は pipeline-context と一致する", () => {
  // 実行と検証
  expectTypeOf<IMiddleware.MapKeyContext>().toEqualTypeOf<IMapKeyContext>();
  expectTypeOf<IMiddleware.OpenContext>().toEqualTypeOf<IOpenContext>();
  expectTypeOf<IMiddleware.CloseContext>().toEqualTypeOf<ICloseContext>();
  expectTypeOf<IMiddleware.UseContext>().toEqualTypeOf<
    | ISetContext
    | IRepairContext
    | IGetContext
    | IStreamContext
    | IHasContext
    | IDeleteContext
    | IClearContext
  >();
  expectTypeOf<IMiddleware.EncodeContext<string>>().toEqualTypeOf<IEncodeContext<string, string>>();
  expectTypeOf<IMiddleware.DecodeContext<string>>().toEqualTypeOf<IDecodeContext<string, string>>();
  expectTypeOf<IMiddleware.EncodeStreamContext<ArrayBuffer>>().toEqualTypeOf<
    IEncodeStreamContext<ArrayBuffer, ArrayBuffer>
  >();
  expectTypeOf<IMiddleware.DecodeStreamContext<ArrayBuffer>>().toEqualTypeOf<
    IDecodeStreamContext<ArrayBuffer, ArrayBuffer>
  >();
});

test("IMiddleware の next は引数なしで Promise<void> を返す", () => {
  // 実行と検証
  expectTypeOf<IMiddleware.INext>().toEqualTypeOf<IMiddleware.INext>();
  expectTypeOf<IMiddleware.INext>().returns.toEqualTypeOf<Promise<void>>();
});

test("IPipelineContext の get は unknown を返す", () => {
  // 実行と検証
  function getUnknown(ctx: IPipelineContext): unknown {
    return ctx.get("unikvs:key");
  }

  expectTypeOf(getUnknown).returns.toEqualTypeOf<unknown>();
});

test("型付き IPipelineContext の get はキーに対応する値の型を返す", () => {
  // 実行と検証
  function getCount(
    ctx: IPipelineContext<{ readonly count: number; readonly label: string }>,
  ): [number, string, unknown] {
    return [ctx.get("count"), ctx.get("label"), ctx.get("unknown")];
  }

  expectTypeOf(getCount).returns.toEqualTypeOf<[number, string, unknown]>();
});

test("型付き IPipelineContext の set と setReadonly は値の型を要求する", () => {
  // 実行と検証
  function setCount(ctx: IPipelineContext<{ readonly count: number }>): void {
    ctx.set("count", 1);
    ctx.set("unknown", { whatever: true });
    ctx.setReadonly("count", 2);
  }

  expectTypeOf(setCount).returns.toBeVoid();
});

declare global {
  interface UniKvsPipelineContextTypes {
    readonly "test:count": number;
  }
}

test("IPipelineContext の型引数は UniKvsPipelineContextTypes の宣言マージで決まる", () => {
  // 実行と検証
  function getMerged(ctx: IPipelineContext): [number, unknown] {
    return [ctx.get("test:count"), ctx.get("other")];
  }

  expectTypeOf(getMerged).returns.toEqualTypeOf<[number, unknown]>();
});

test("IPipelineContext は get/set/setReadonly を持つ", () => {
  // 実行と検証
  expectTypeOf<IPipelineContext>().toHaveProperty("get");
  expectTypeOf<IPipelineContext>().toHaveProperty("set");
  expectTypeOf<IPipelineContext>().toHaveProperty("setReadonly");
});

test("pipeline-context の key と action と signal は絞られる", () => {
  // 実行と検証
  expectTypeOf<IMapKeyContext["key"]>().toEqualTypeOf<string>();
  expectTypeOf<IKeyedActionContext["key"]>().toEqualTypeOf<string>();
  expectTypeOf<IActionContext["signal"]>().toEqualTypeOf<AbortSignal>();
  expectTypeOf<IActionContext["action"]>().toEqualTypeOf<
    "open" | "close" | "set" | "get" | "repair" | "stream" | "has" | "delete" | "clear"
  >();
  expectTypeOf<ILifecycleContext["action"]>().toEqualTypeOf<"open" | "close">();
  expectTypeOf<IOpenContext["action"]>().toEqualTypeOf<"open">();
  expectTypeOf<ICloseContext["action"]>().toEqualTypeOf<"close">();
  expectTypeOf<IKeyedActionContext["action"]>().toEqualTypeOf<
    "set" | "repair" | "get" | "stream" | "has" | "delete" | "clear"
  >();
  expectTypeOf<ISetContext["action"]>().toEqualTypeOf<"set">();
  expectTypeOf<IRepairContext["action"]>().toEqualTypeOf<"repair">();
  expectTypeOf<IGetContext["action"]>().toEqualTypeOf<"get">();
  expectTypeOf<IStreamContext["action"]>().toEqualTypeOf<"stream">();
  expectTypeOf<IHasContext["action"]>().toEqualTypeOf<"has">();
  expectTypeOf<IDeleteContext["action"]>().toEqualTypeOf<"delete">();
  expectTypeOf<IClearContext["action"]>().toEqualTypeOf<"clear">();
});

test("IRepairContext は targets を持つ", () => {
  // 実行と検証
  expectTypeOf<IRepairContext["targets"]>().toEqualTypeOf<readonly string[]>();
});

test("IEncodeContext と IDecodeContext は source と destination を持つ", () => {
  // 実行と検証
  expectTypeOf<IEncodeContext<string, number>["source"]>().toEqualTypeOf<string>();
  expectTypeOf<IEncodeContext<string, number>["destination"]>().toEqualTypeOf<number>();
  expectTypeOf<IDecodeContext<string, number>["source"]>().toEqualTypeOf<string>();
  expectTypeOf<IDecodeContext<string, number>["destination"]>().toEqualTypeOf<number>();
  expectTypeOf<IEncodeStreamContext<ArrayBuffer, number>["source"]>().toEqualTypeOf<
    IReadableStream<ArrayBuffer>
  >();
  expectTypeOf<IDecodeStreamContext<ArrayBuffer, number>["destination"]>().toEqualTypeOf<
    IReadableStream<number>
  >();
});

test("IWritableStream と IReadableStream は標準のストリームを継承する", () => {
  // 実行と検証
  expectTypeOf<IWritableStream<Uint8Array<ArrayBuffer>>>().toEqualTypeOf<
    IWritableStream<Uint8Array<ArrayBuffer>>
  >();
});

test("ITransformStream は readable と writable を持つ", () => {
  // 実行と検証
  expectTypeOf<ITransformStream<ArrayBuffer, number>["readable"]>().toEqualTypeOf<
    IReadableStream<number>
  >();
  expectTypeOf<ITransformStream<ArrayBuffer, number>["writable"]>().toEqualTypeOf<
    IWritableStream<ArrayBuffer>
  >();
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
function expectTypeErrors(typedCtx: IPipelineContext<{ readonly count: number }>): void {
  // @ts-expect-error count は number のため文字列は渡せない
  typedCtx.set("count", "not a number");

  // @ts-expect-error count は number のため文字列は渡せない
  typedCtx.setReadonly("count", "not a number");

  // @ts-expect-error test:count は number のため文字列は渡せない
  (null as unknown as IPipelineContext).set("test:count", "not a number");

  // @ts-expect-error I18nErrorBase を継承していないクラスへは登録できない
  setErrorMessage(globalThis.Error, "message", "ja");

  // @ts-expect-error メッセージは文字列かメッセージ関数でなければならない
  setErrorMessage(ErrorBase, 42, "ja");

  // @ts-expect-error read を省略した型は IStorage を満たさない
  const incompleteStorage: IStorage = {} as Omit<IStorage, "read">;

  void incompleteStorage;
  void typedCtx;
}

test("不正な使用はコンパイルエラーになる", () => {
  // 実行と検証
  expectTypeOf(expectTypeErrors).toBeFunction();
});
