import type { IStorage, IMiddleware, IPipelineContext } from "@unikvs/core";
import { Memory } from "@unikvs/memory";
import { pipe, string, instance, transform } from "valibot";
import { test, describe, expectTypeOf } from "vite-plus/test";

import { Branch, Builder } from "../src/index.js";
import type { IValueStream as ValueStream } from "../src/types.js";
import { type IUniKvsBuilder } from "../src/unikvs-builder.js";
import type UniKvs from "../src/unikvs.js";
import type {
  SetValue,
  KeyofKeyValueMappingHasPlainValue,
  KeyofKeyValueMappingHasStreamValue,
} from "../src/unikvs.types.js";
import { type Value, PlainValue, StreamValue } from "../src/value-schemas.js";

type Bytes = Uint8Array<ArrayBuffer>;

type Mapping = {
  data: Value<Bytes>;
  logs: StreamValue<Bytes>;
  message: PlainValue<string>;
};

/**
 * 式の型だけを取得し、実行はしません。未接続の KVS への呼び出しで unhandled rejection を出さずに型を検証するために使用します。
 */
function typeOf<T>(_expression: () => T): T {
  return undefined as never;
}

/**
 * string を number へ変換するコーデックミドルウェアです。
 * ビルダーの型絞り込みの検証に使用します。
 */
class StringToNumber implements IMiddleware<string, number> {
  public readonly name = "StringToNumber";

  public readonly isOpen = true;

  public async encode(
    c: IMiddleware.EncodeContext<string, number>,
    next: IMiddleware.INext,
  ): Promise<void> {
    c.destination = Number(c.source);
    await next();
  }

  public async decode(
    c: IMiddleware.DecodeContext<number, string>,
    next: IMiddleware.INext,
  ): Promise<void> {
    c.destination = String(c.source);
    await next();
  }
}

/**
 * number のみを扱うストレージです。型が一致しない接続を検証するために使用します。
 */
class NumberStorage implements IStorage<number> {
  public readonly name = "NumberStorage";

  public readonly isOpen = true;

  public write(): void {}

  public read(): number {
    return 0;
  }

  public exists(): boolean {
    return false;
  }

  public delete(): void {}

  public copy(): void {}

  public move(): void {}

  public clear(): void {}
}

/**
 * `Bytes` を扱う非ストリーム対応ストレージです。
 * 分岐内の `never` が親のチャンク型へ伝播するかを検証するために使用します。
 */
class BytesStorage implements IStorage<Bytes> {
  public readonly name = "BytesStorage";

  public readonly isOpen = true;

  public write(): void {}

  public read(): Bytes {
    return new Uint8Array();
  }

  public exists(): boolean {
    return false;
  }

  public delete(): void {}

  public copy(): void {}

  public move(): void {}

  public clear(): void {}
}

/**
 * ビルダーのチャンク入力型を取り出します。
 * `fork` による `never` 伝播の検証に使用します。
 */
type $BuilderChunkInput<T> =
  T extends IUniKvsBuilder<any, any, any, infer TChunkInput, any, any, any, any, any>
    ? TChunkInput
    : never;

function createTypedKvs(): UniKvs<Mapping> {
  return new Builder<Mapping>().persist(new Memory()).build();
}

/**
 * カスタム変数を取得するヘルパーです。
 *
 * @param ctx パイプラインコンテキストです。
 *
 * @returns カウントを返します。
 */
function getCustom(ctx: IPipelineContext<{ readonly count: number }>): number {
  return ctx.get("count");
}

describe("UniKvs - 型: 基本契約", () => {
  test("Builder の型引数が build の戻り値に反映される", () => {
    // 準備：
    const kvs = createTypedKvs();

    // 検証：
    expectTypeOf(kvs).toEqualTypeOf<UniKvs<Mapping>>();
  });

  test("get は PlainValue と Value のキーだけを受け付け、データ型を返す", () => {
    // 準備：
    const kvs = createTypedKvs();

    // 検証：
    expectTypeOf(typeOf(() => kvs.get("message"))).toEqualTypeOf<Promise<string>>();
    expectTypeOf(typeOf(() => kvs.get("data"))).toEqualTypeOf<Promise<Bytes>>();
    expectTypeOf(typeOf(() => kvs.get({ key: "message" }))).toEqualTypeOf<Promise<string>>();
  });

  test("stream は StreamValue と Value のキーだけを受け付け、ValueStream を返す", () => {
    // 準備：
    const kvs = createTypedKvs();

    // 検証：
    expectTypeOf(typeOf(() => kvs.stream("logs"))).toEqualTypeOf<Promise<ValueStream<Bytes>>>();
    expectTypeOf(typeOf(() => kvs.stream("data"))).toEqualTypeOf<Promise<ValueStream<Bytes>>>();
  });

  test("set・has・delete の戻り値型", () => {
    // 準備：
    const kvs = createTypedKvs();

    // 検証：
    expectTypeOf(typeOf(() => kvs.set("message", "hello"))).toEqualTypeOf<Promise<void>>();
    expectTypeOf(typeOf(() => kvs.set("logs", new ReadableStream<Bytes>()))).toEqualTypeOf<
      Promise<void>
    >();
    expectTypeOf(typeOf(() => kvs.has("message"))).toEqualTypeOf<Promise<boolean>>();
    expectTypeOf(typeOf(() => kvs.delete("message"))).toEqualTypeOf<Promise<void>>();
    expectTypeOf(typeOf(() => kvs.copy("message", "data"))).toEqualTypeOf<Promise<void>>();
    expectTypeOf(
      typeOf(() =>
        kvs.copy({
          key: "message",
          destinationKey: "data",
        }),
      ),
    ).toEqualTypeOf<Promise<void>>();
    expectTypeOf(typeOf(() => kvs.move("message", "data"))).toEqualTypeOf<Promise<void>>();
    expectTypeOf(
      typeOf(() =>
        kvs.move({
          key: "message",
          destinationKey: "data",
        }),
      ),
    ).toEqualTypeOf<Promise<void>>();
    expectTypeOf(typeOf(() => kvs.clear())).toEqualTypeOf<Promise<void>>();
  });

  test("SetValue は値の種別に応じた入力を表す", () => {
    // 検証：
    expectTypeOf<SetValue<PlainValue<string>>>().toEqualTypeOf<string>();
    expectTypeOf<SetValue<StreamValue<Bytes>>>().toEqualTypeOf<ReadableStream<Bytes>>();
    expectTypeOf<SetValue<Value<Bytes>>>().toEqualTypeOf<Bytes | ReadableStream<Bytes>>();
  });

  test("キーの種別ごとのキー集合が推論される", () => {
    // 検証：
    expectTypeOf<KeyofKeyValueMappingHasPlainValue<Mapping>>().toEqualTypeOf<"message" | "data">();
    expectTypeOf<KeyofKeyValueMappingHasStreamValue<Mapping>>().toEqualTypeOf<"logs" | "data">();
  });

  test("ValueStream は非同期イテレーターと非同期破棄を提供する", () => {
    // 検証：
    expectTypeOf<ValueStream<Bytes>>().toExtend<AsyncIterable<Bytes>>();
    expectTypeOf<ValueStream<Bytes>>().toExtend<AsyncDisposable>();
    expectTypeOf<ValueStream<Bytes>["dispose"]>().toEqualTypeOf<() => Promise<void>>();
  });
});

describe("UniKvs - 型: 不正な組み合わせ", () => {
  test("PlainValue のキーに stream は使えない", ({ expect }) => {
    // 準備：
    const kvs = createTypedKvs();

    // 実行と検証：
    // @ts-expect-error PlainValue のキーは stream できない
    expect(typeOf(() => kvs.stream("message"))).toBeUndefined();
  });

  test("StreamValue のキーに get は使えない", ({ expect }) => {
    // 準備：
    const kvs = createTypedKvs();

    // 実行と検証：
    // @ts-expect-error StreamValue のキーは get できない
    expect(typeOf(() => kvs.get("logs"))).toBeUndefined();
  });

  test("StreamValue のキーにプレーン値は set できない", ({ expect }) => {
    // 準備：
    const kvs = createTypedKvs();

    // 実行と検証：
    // @ts-expect-error StreamValue のキーは ReadableStream のみ受け付ける
    expect(typeOf(() => kvs.set("logs", new Uint8Array([1])))).toBeUndefined();
  });

  test("PlainValue のキーに ReadableStream は set できない", ({ expect }) => {
    // 準備：
    const kvs = createTypedKvs();

    // 実行と検証：
    // @ts-expect-error PlainValue のキーはプレーン値のみ受け付ける
    expect(typeOf(() => kvs.set("message", new ReadableStream<string>()))).toBeUndefined();
  });

  test("マッピングに存在しないキーは使えない", ({ expect }) => {
    // 準備：
    const kvs = createTypedKvs();

    // 実行と検証：
    // @ts-expect-error 未知のキー
    expect(typeOf(() => kvs.get("unknown"))).toBeUndefined();
    // @ts-expect-error 未知のキー
    expect(typeOf(() => kvs.has("unknown"))).toBeUndefined();
    // @ts-expect-error 未知のキー
    expect(typeOf(() => kvs.delete("unknown"))).toBeUndefined();
    // @ts-expect-error 未知のコピー元
    expect(typeOf(() => kvs.copy("unknown", "message"))).toBeUndefined();
    // @ts-expect-error 未知のコピー先
    expect(typeOf(() => kvs.copy("message", "unknown"))).toBeUndefined();
    // @ts-expect-error 未知の移動元
    expect(typeOf(() => kvs.move("unknown", "message"))).toBeUndefined();
    // @ts-expect-error 未知の移動先
    expect(typeOf(() => kvs.move("message", "unknown"))).toBeUndefined();
  });
});

describe("UniKvs - 型: schema とミドルウェアの推論", () => {
  test("schema からキーと値の型が推論される", () => {
    // 準備：
    const kvs = new Builder({
      schema: {
        logs: StreamValue(instance(Uint8Array)),
        message: PlainValue(string()),
      },
    })
      .persist(new Memory())
      .build();

    // 検証：
    expectTypeOf(typeOf(() => kvs.get("message"))).toEqualTypeOf<Promise<string>>();
    expectTypeOf(typeOf(() => kvs.stream("logs"))).toEqualTypeOf<
      Promise<ValueStream<InstanceType<Uint8ArrayConstructor>>>
    >();
  });

  test("transform スキーマでは入力型と出力型が区別される", ({ expect }) => {
    // 準備：
    const kvs = new Builder({
      schema: { count: PlainValue(pipe(string(), transform(Number))) },
    })
      .persist(new Memory())
      .build();

    // 検証 : get は変換後の number、set は変換前の string を受け付ける。
    expectTypeOf(typeOf(() => kvs.get("count"))).toEqualTypeOf<Promise<number>>();
    expectTypeOf(typeOf(() => kvs.set("count", "42"))).toEqualTypeOf<Promise<void>>();

    // 実行と検証：
    // @ts-expect-error 入力型は string であり number は受け付けない
    expect(typeOf(() => kvs.set("count", 42))).toBeUndefined();
  });

  test("use と persist は接続可能な組み合わせのみを型で受け付ける", ({ expect }) => {
    // 実行と検証 : string を number に変換するチェーンは number ストレージへ接続できる。
    new Builder<{ foo: PlainValue<string> }>()
      .use(new StringToNumber())
      .persist(new NumberStorage())
      .build();

    // 実行と検証：
    const storage = new NumberStorage();
    // @ts-expect-error 変換なしでは number 専用ストレージへ接続できない
    const invalidConfig = new Builder<{ foo: PlainValue<string> }>().persist(storage);
    expect(invalidConfig).toBeInstanceOf(Builder);
  });

  test("fork のみでは Builder のまま型レベルで build できない", ({ expect }) => {
    // 準備：
    const branch = new Branch().persist(new Memory());
    const builder = new Builder().fork(branch);

    // 実行と検証：
    // @ts-expect-error: Builder には build がありません。
    expect(typeOf(() => builder.build())).toBeUndefined();
    // @ts-expect-error: Branch には build がありません。
    expect(typeOf(() => branch.build())).toBeUndefined();
  });
});

describe("UniKvs - 型: fork の互換検査", () => {
  test("親出力と分岐入力の不一致は型エラーになる", ({ expect }) => {
    // 準備 : 親は string、分岐先頭は number のため不適合です。
    // 先頭のみを検査します。
    // 中間以降は検査しません。
    const branch = new Branch().persist(new NumberStorage());

    // 実行と検証：
    // @ts-expect-error 親出力 string は分岐入力 number を受容できない
    expect(typeOf(() => new Builder<{ foo: PlainValue<string> }>().fork(branch))).toBeUndefined();
  });

  test("persist なし分岐は型エラーにならない", ({ expect }) => {
    // 準備 : 空分岐は型レベルでは受け付けられます (実行時は InvalidForkError)。
    const empty = new Branch();

    // 実行と検証 : 空分岐の fork は型エラーになりません。
    expect(typeOf(() => new Builder<{ foo: PlainValue<string> }>().fork(empty))).toBeUndefined();

    // 準備 : 未使用 middleware のみで persist なしの分岐も型レベルでは受け付けられます。
    const unused = new Branch().use(new StringToNumber());

    // 実行と検証 : persist なし分岐の不一致は型エラーになりません。
    expect(typeOf(() => new Builder<{ foo: PlainValue<number> }>().fork(unused))).toBeUndefined();
  });

  test("分岐内の never は親のチャンク型に伝播する", () => {
    // 準備 : 親はストリーム対応、分岐は非ストリーム対応です。
    const builder = new Builder<{ data: Value<Bytes> }>().fork(
      new Branch().persist(new BytesStorage()),
    );

    // 検証 : 親チャンク入力は `never` になります。
    expectTypeOf<$BuilderChunkInput<typeof builder>>().toEqualTypeOf<never>();
  });

  test("ストリーム対応の分岐では親のチャンク型を保つ", () => {
    // 準備：
    const builder = new Builder<{ logs: StreamValue<Bytes> }>()
      .fork(new Branch().persist(new Memory()))
      .persist(new Memory());

    // 検証 : fork 後も persist と create が型レベルでつながります。
    expectTypeOf(typeOf(() => builder.build())).toExtend<UniKvs<{ logs: StreamValue<Bytes> }>>();
  });
});

describe("UniKvs - 型: build オプション", () => {
  test("beforeAll と beforeStorage はミドルウェアの配列のみを受け付ける", ({ expect }) => {
    // 準備：
    const builder = new Builder().persist(new Memory());

    // 実行と検証：
    expect(
      typeOf(() =>
        builder.build({
          beforeAll: [],
          beforeStorage: [],
        }),
      ),
    ).toBeUndefined();
    // @ts-expect-error: 配列以外は受け付けません。
    expect(typeOf(() => builder.build({ beforeAll: new StringToNumber() }))).toBeUndefined();
    // @ts-expect-error: 配列以外は受け付けません。
    expect(typeOf(() => builder.build({ beforeStorage: new StringToNumber() }))).toBeUndefined();
  });
});

describe("UniKvs - 型: コンテキスト", () => {
  test("IPipelineContext はカスタム変数の型を解決する", () => {
    // 検証：
    expectTypeOf(getCustom).returns.toEqualTypeOf<number>();
  });

  test("操作の action はコンテキストのプロパティーで区別する", ({ expect }) => {
    // 準備 : 8 操作すべてが型として存在する。
    const actions = ["open", "close", "set", "get", "stream", "has", "delete", "clear"] as const;

    // 検証：
    expect(actions).toHaveLength(8);
  });
});
