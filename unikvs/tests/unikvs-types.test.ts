import type { IStorage, ITransformer } from "@unikvs/core";
import { Memory } from "@unikvs/memory";
import * as v from "valibot";
import { describe, expectTypeOf, test } from "vitest";

import { PlainValue, StreamValue, type Value } from "../src/unikvs-config.js";
import type {
  KeyofKeyValueMappingHasPlainValue,
  KeyofKeyValueMappingHasStreamValue,
  SetValue,
} from "../src/unikvs.js";
import UniKvs from "../src/unikvs.js";
import type { ValueStream } from "../src/value-stream.types.js";

type Bytes = Uint8Array<ArrayBufferLike>;

type Mapping = {
  message: PlainValue<string>;
  logs: StreamValue<Bytes>;
  data: Value<Bytes>;
};

/**
 * 式の型だけを取得し、実行はしません。未接続の KVS への呼び出しで unhandled rejection を出さずに型を検証するために使用します。
 */
function typeOf<T>(_expression: () => T): T {
  return undefined as never;
}

/**
 * string を number へ変換するコーデックトランスフォーマーです。
 * ビルダーの型絞り込みの検証に使用します。
 */
class StringToNumber implements ITransformer<string, number, number, string> {
  readonly name = "StringToNumber";
  readonly isOpen = true;

  encode(args: ITransformer.EncodeArgs<string>): number {
    return Number(args.data);
  }

  decode(args: ITransformer.DecodeArgs<number>): string {
    return String(args.data);
  }
}

/**
 * number のみを扱うストレージです。型が一致しない接続を検証するために使用します。
 */
class NumberStorage implements IStorage<number> {
  readonly name = "NumberStorage";
  readonly isOpen = true;

  write(): void {}
  read(): number {
    return 0;
  }
  exists(): boolean {
    return false;
  }
  delete(): void {}
  clear(): void {}
}

function createTypedKvs(): UniKvs<Mapping> {
  return UniKvs.config<Mapping>().appendStorage(new Memory()).create();
}

describe("UniKvs - 型: 基本契約", () => {
  test("config の型引数が create の戻り値に反映される", () => {
    // 準備
    const kvs = createTypedKvs();

    // 検証
    expectTypeOf(kvs).toEqualTypeOf<UniKvs<Mapping>>();
  });

  test("get は PlainValue と Value のキーだけを受け付け、データ型を返す", () => {
    // 準備
    const kvs = createTypedKvs();

    // 検証
    expectTypeOf(typeOf(() => kvs.get("message"))).toEqualTypeOf<Promise<string>>();
    expectTypeOf(typeOf(() => kvs.get("data"))).toEqualTypeOf<Promise<Bytes>>();
    expectTypeOf(typeOf(() => kvs.get({ key: "message" }))).toEqualTypeOf<Promise<string>>();
  });

  test("stream は StreamValue と Value のキーだけを受け付け、ValueStream を返す", () => {
    // 準備
    const kvs = createTypedKvs();

    // 検証
    expectTypeOf(typeOf(() => kvs.stream("logs"))).toEqualTypeOf<Promise<ValueStream<Bytes>>>();
    expectTypeOf(typeOf(() => kvs.stream("data"))).toEqualTypeOf<Promise<ValueStream<Bytes>>>();
  });

  test("set・has・delete の戻り値型", () => {
    // 準備
    const kvs = createTypedKvs();

    // 検証
    expectTypeOf(typeOf(() => kvs.set("message", "hello"))).toEqualTypeOf<Promise<void>>();
    expectTypeOf(typeOf(() => kvs.set("logs", new ReadableStream<Bytes>()))).toEqualTypeOf<
      Promise<void>
    >();
    expectTypeOf(typeOf(() => kvs.has("message"))).toEqualTypeOf<Promise<boolean>>();
    expectTypeOf(typeOf(() => kvs.delete("message"))).toEqualTypeOf<Promise<void>>();
    expectTypeOf(typeOf(() => kvs.clear())).toEqualTypeOf<Promise<void>>();
  });

  test("SetValue は値の種別に応じた入力を表す", () => {
    // 検証
    expectTypeOf<SetValue<PlainValue<string>>>().toEqualTypeOf<string>();
    expectTypeOf<SetValue<StreamValue<Bytes>>>().toEqualTypeOf<ReadableStream<Bytes>>();
    expectTypeOf<SetValue<Value<Bytes>>>().toEqualTypeOf<Bytes | ReadableStream<Bytes>>();
  });

  test("キーの種別ごとのキー集合が推論される", () => {
    // 検証
    expectTypeOf<KeyofKeyValueMappingHasPlainValue<Mapping>>().toEqualTypeOf<"message" | "data">();
    expectTypeOf<KeyofKeyValueMappingHasStreamValue<Mapping>>().toEqualTypeOf<"logs" | "data">();
  });

  test("ValueStream は非同期イテレーターと非同期破棄を提供する", () => {
    // 検証
    expectTypeOf<ValueStream<Bytes>>().toMatchTypeOf<AsyncIterable<Bytes>>();
    expectTypeOf<ValueStream<Bytes>>().toMatchTypeOf<AsyncDisposable>();
    expectTypeOf<ValueStream<Bytes>["dispose"]>().toEqualTypeOf<() => Promise<void>>();
  });
});

describe("UniKvs - 型: 不正な組み合わせ", () => {
  test("PlainValue のキーに stream は使えない", ({ expect }) => {
    // 準備
    const kvs = createTypedKvs();

    // 実行と検証
    // @ts-expect-error PlainValue のキーは stream できない
    expect(typeOf(() => void kvs.stream("message"))).toBeUndefined();
  });

  test("StreamValue のキーに get は使えない", ({ expect }) => {
    // 準備
    const kvs = createTypedKvs();

    // 実行と検証
    // @ts-expect-error StreamValue のキーは get できない
    expect(typeOf(() => void kvs.get("logs"))).toBeUndefined();
  });

  test("StreamValue のキーにプレーン値は set できない", ({ expect }) => {
    // 準備
    const kvs = createTypedKvs();

    // 実行と検証
    // @ts-expect-error StreamValue のキーは ReadableStream のみ受け付ける
    expect(typeOf(() => void kvs.set("logs", new Uint8Array([1])))).toBeUndefined();
  });

  test("PlainValue のキーに ReadableStream は set できない", ({ expect }) => {
    // 準備
    const kvs = createTypedKvs();

    // 実行と検証
    // @ts-expect-error PlainValue のキーはプレーン値のみ受け付ける
    expect(typeOf(() => void kvs.set("message", new ReadableStream<string>()))).toBeUndefined();
  });

  test("マッピングに存在しないキーは使えない", ({ expect }) => {
    // 準備
    const kvs = createTypedKvs();

    // 実行と検証
    // @ts-expect-error 未知のキー
    expect(typeOf(() => void kvs.get("unknown"))).toBeUndefined();
    // @ts-expect-error 未知のキー
    expect(typeOf(() => void kvs.has("unknown"))).toBeUndefined();
    // @ts-expect-error 未知のキー
    expect(typeOf(() => void kvs.delete("unknown"))).toBeUndefined();
  });
});

describe("UniKvs - 型: schema とトランスフォーマーの推論", () => {
  test("schema からキーと値の型が推論される", () => {
    // 準備
    const kvs = UniKvs.config({
      schema: {
        message: PlainValue(v.string()),
        logs: StreamValue(v.instance(Uint8Array)),
      },
    })
      .appendStorage(new Memory())
      .create();

    // 検証
    expectTypeOf(typeOf(() => kvs.get("message"))).toEqualTypeOf<Promise<string>>();
    expectTypeOf(typeOf(() => kvs.stream("logs"))).toEqualTypeOf<
      Promise<ValueStream<InstanceType<Uint8ArrayConstructor>>>
    >();
  });

  test("transform スキーマでは入力型と出力型が区別される", ({ expect }) => {
    // 準備
    const kvs = UniKvs.config({
      schema: { count: PlainValue(v.pipe(v.string(), v.transform(Number))) },
    })
      .appendStorage(new Memory())
      .create();

    // 検証: get は変換後の number、set は変換前の string を受け付ける
    expectTypeOf(typeOf(() => kvs.get("count"))).toEqualTypeOf<Promise<number>>();
    expectTypeOf(typeOf(() => kvs.set("count", "42"))).toEqualTypeOf<Promise<void>>();

    // 実行と検証
    // @ts-expect-error 入力型は string であり number は受け付けない
    expect(typeOf(() => void kvs.set("count", 42))).toBeUndefined();
  });

  test("appendTransformer と appendStorage の型が接続可能な組み合わせを強制する", ({ expect }) => {
    // 実行と検証: string を number に変換するチェーンは number ストレージへ接続できる
    UniKvs.config<{ foo: PlainValue<string> }>()
      .appendTransformer(new StringToNumber())
      .appendStorage(new NumberStorage())
      .create();

    // 実行と検証
    const storage = new NumberStorage();
    // @ts-expect-error 変換なしでは number 専用ストレージへ接続できない
    const invalidConfig = UniKvs.config<{ foo: PlainValue<string> }>().appendStorage(storage);
    expect(invalidConfig).toBeDefined();
  });
});
