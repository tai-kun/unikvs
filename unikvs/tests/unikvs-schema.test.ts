import type { ITransformer } from "@unikvs/core";
import { Memory } from "@unikvs/memory";
import * as v from "valibot";
import { describe, expectTypeOf, test } from "vitest";

import {
  InvalidInputError,
  InvalidOutputError,
  PluginOperationAggregateError,
} from "../src/errors.js";
import {
  type $InferKeyValueMapping,
  Value,
  PlainValue,
  StreamValue,
} from "../src/unikvs-config.js";
import UniKvs from "../src/unikvs.js";
import type { ValueStream } from "../src/value-stream.types.js";

/**
 * Memory ストレージ内部の Map をテストから参照するためのアクセサーです。
 */
function mapOf(storage: Memory): Map<string, unknown> {
  return (storage as unknown as { map: Map<string, unknown> }).map;
}

/**
 * チャンク列を順に流す ReadableStream を作成します。
 */
function streamOf(chunks: Uint8Array<ArrayBuffer>[]): ReadableStream<Uint8Array<ArrayBuffer>> {
  return new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(controller) {
      for (const c of chunks) {
        controller.enqueue(c);
      }
      controller.close();
    },
  });
}

/**
 * 非同期イテラブルの全チャンクを配列として読み取ります。
 */
async function collect(stream: AsyncIterable<unknown>): Promise<unknown[]> {
  const chunks: unknown[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  return chunks;
}

describe("UniKvs.config - schema からの型推論", () => {
  test("オブジェクト形式の schema からキーと値のマッピングが推論される", () => {
    // 準備
    const schema = {
      message: PlainValue(v.string()),
      logs: StreamValue(v.instance(Uint8Array)),
      data: Value(v.string()),
    };

    // 検証
    expectTypeOf<$InferKeyValueMapping<typeof schema>>().toEqualTypeOf<{
      readonly message: PlainValue<string, string>;
      readonly logs: StreamValue<
        InstanceType<Uint8ArrayConstructor>,
        InstanceType<Uint8ArrayConstructor>
      >;
      readonly data: Value<string, string>;
    }>();
  });

  test("配列形式の schema からキーと値のマッピングが推論される", () => {
    // 準備
    const schema = [
      [v.pipe(v.string(), v.regex(/^msg-.+/)), PlainValue(v.string())],
      [v.pipe(v.string(), v.regex(/^img-.+/)), StreamValue(v.instance(Uint8Array))],
    ] as const;

    // 検証
    expectTypeOf<$InferKeyValueMapping<typeof schema>>().toEqualTypeOf<{
      readonly [key: string]:
        | PlainValue<string, string>
        | StreamValue<InstanceType<Uint8ArrayConstructor>, InstanceType<Uint8ArrayConstructor>>;
    }>();
  });

  test("推論された型で set・get・stream を呼び出せる", async ({ expect }) => {
    // 準備
    const kvs = UniKvs.config({
      schema: {
        message: PlainValue(v.string()),
        logs: StreamValue(v.instance(Uint8Array)),
      },
    })
      .appendStorage(new Memory())
      .create();
    await kvs.open();

    // 実行と検証
    await kvs.set("message", "hello");
    const message = await kvs.get("message");
    expectTypeOf(message).toEqualTypeOf<string>();
    expect(message).toBe("hello");

    await kvs.set("logs", streamOf([new Uint8Array([1])]));
    const logs = await kvs.stream("logs");
    expectTypeOf(logs).toEqualTypeOf<ValueStream<InstanceType<Uint8ArrayConstructor>>>();
    await logs.dispose();

    // 検証: StreamValue のキーにプレーン値は型エラー
    // @ts-expect-error
    const invalidSet = kvs.set("logs", "hello");
    await expect(invalidSet).rejects.toThrow(InvalidInputError);

    // 後片付け
    await kvs.close();
  });
});

describe("UniKvs - schema による入出力検証", () => {
  test("PlainValue のスキーマが set の入力と get の出力を検証する", async ({ expect }) => {
    // 準備
    const kvs = UniKvs.config({
      schema: { message: PlainValue(v.pipe(v.string(), v.minLength(1))) },
    })
      .appendStorage(new Memory())
      .create();
    await kvs.open();

    // 実行
    await kvs.set("message", "hello");

    // 検証
    await expect(kvs.get("message")).resolves.toBe("hello");
    await expect(kvs.set("message", "")).rejects.toThrow(InvalidInputError);

    // 後片付け
    await kvs.close();
  });

  test("get はストレージ内の値がスキーマに一致しなければ InvalidOutputError を投げる", async ({
    expect,
  }) => {
    // 準備
    const storage = new Memory();
    const kvs = UniKvs.config({ schema: { message: PlainValue(v.string()) } })
      .appendStorage(storage)
      .create();
    await kvs.open();
    mapOf(storage).set("message", 42);

    // 実行と検証
    await expect(kvs.get("message")).rejects.toThrow(InvalidOutputError);

    // 後片付け
    await kvs.close();
  });

  test("StreamValue のスキーマが書き込みチャンクを検証する", async ({ expect }) => {
    // 準備
    const storage = new Memory();
    const kvs = UniKvs.config({ schema: { logs: StreamValue(v.instance(Uint8Array)) } })
      .appendStorage(storage)
      .create();
    await kvs.open();

    // 実行
    const ex = await kvs.set("logs", streamOf([new Uint8Array([1]), "bad"] as never)).then(
      () => null,
      (e) => e as PluginOperationAggregateError,
    );

    // 検証
    expect(ex).toBeInstanceOf(PluginOperationAggregateError);
    const reasons = ((ex?.meta.errors ?? []) as readonly { reason: unknown }[]).map(
      (error) => error.reason,
    );
    expect(reasons.some((reason) => reason instanceof InvalidInputError)).toBe(true);
    expect(mapOf(storage).has("logs")).toBe(false);

    // 後片付け
    await kvs.close();
  });

  test("StreamValue のスキーマが読み取りチャンクを検証する", async ({ expect }) => {
    // 準備
    const storage = new Memory();
    const kvs = UniKvs.config({
      schema: {
        logs: StreamValue(
          v.pipe(
            v.instance(Uint8Array),
            v.check((b) => b.byteLength > 0),
          ),
        ),
      },
    })
      .appendStorage(storage)
      .create();
    await kvs.open();
    mapOf(storage).set("logs", new Uint8Array());

    // 実行
    const logs = await kvs.stream("logs");

    // 検証
    await expect(collect(logs)).rejects.toThrow(InvalidOutputError);

    // 後片付け
    await kvs.close();
  });

  test("ReadableStream を継承しない互換オブジェクトもストリームとして検証する", async ({
    expect,
  }) => {
    // 準備
    const kvs = UniKvs.config({ schema: { logs: StreamValue(v.instance(Uint8Array)) } })
      .appendStorage(new Memory())
      .create();
    await kvs.open();
    const source = streamOf([new Uint8Array([1, 2])]);
    const compatible = {
      getReader: source.getReader.bind(source),
      pipeThrough: source.pipeThrough.bind(source),
      pipeTo: source.pipeTo.bind(source),
      tee: source.tee.bind(source),
      cancel: source.cancel.bind(source),
    } as unknown as ReadableStream<Uint8Array<ArrayBuffer>>;

    // 実行
    await kvs.set("logs", compatible);

    // 検証
    await expect(collect(await kvs.stream("logs"))).resolves.toStrictEqual([
      new Uint8Array([1, 2]),
    ]);

    // 後片付け
    await kvs.close();
  });

  test("Value のスキーマはプレーン値とストリームのどちらも扱える", async ({ expect }) => {
    // 準備
    const kvs = UniKvs.config({ schema: { data: Value(v.instance(Uint8Array)) } })
      .appendStorage(new Memory())
      .create();
    await kvs.open();

    // 実行
    await kvs.set("data", new Uint8Array([1, 2, 3]));

    // 検証
    await expect(kvs.get("data")).resolves.toStrictEqual(new Uint8Array([1, 2, 3]));

    // 実行
    await kvs.set("data", streamOf([new Uint8Array([4, 5])]));

    // 検証
    await expect(collect(await kvs.stream("data"))).resolves.toStrictEqual([
      new Uint8Array([4, 5]),
    ]);

    // 後片付け
    await kvs.close();
  });

  test("スキーマの検証は UniKvs の入出力で行われる", async ({ expect }) => {
    // 準備
    class JsonTransformer implements ITransformer {
      readonly name = "JsonTransformer";
      isOpen = true;

      encode(args: ITransformer.EncodeArgs): unknown {
        return JSON.stringify(args.data);
      }

      decode(args: ITransformer.DecodeArgs): string {
        return JSON.parse(args.data as string) as string;
      }
    }

    const storage = new Memory();
    const kvs = UniKvs.config({ schema: { message: PlainValue(v.string()) } })
      .appendTransformer(new JsonTransformer())
      .appendStorage(storage)
      .create();
    await kvs.open();

    // 実行
    await kvs.set("message", "hello");

    // 検証: ストレージにはエンコード後の値が保存され、get はデコード後に検証する
    expect(mapOf(storage).get("message")).toBe('"hello"');
    await expect(kvs.get("message")).resolves.toBe("hello");

    // 後片付け
    await kvs.close();
  });

  test("PlainValue のキーに ReadableStream を渡すと InvalidInputError を投げる", async ({
    expect,
  }) => {
    // 準備
    const kvs = UniKvs.config({ schema: { message: PlainValue(v.string()) } })
      .appendStorage(new Memory())
      .create();
    await kvs.open();

    // 実行
    // @ts-expect-error
    const invalidSet = kvs.set("message", streamOf([new Uint8Array([1])]));

    // 検証
    await expect(invalidSet).rejects.toThrow(InvalidInputError);

    // 後片付け
    await kvs.close();
  });

  test("配列形式のスキーマはキーをキースキーマで照合する", async ({ expect }) => {
    // 準備
    const kvs = UniKvs.config({
      schema: [
        [v.pipe(v.string(), v.regex(/^msg-.+/)), PlainValue(v.string())],
        [v.pipe(v.string(), v.regex(/^img-.+/)), StreamValue(v.instance(Uint8Array))],
      ],
    })
      .appendStorage(new Memory())
      .create();
    await kvs.open();

    // 実行
    await kvs.set("msg-1", "hello");

    // 検証
    await expect(kvs.get("msg-1")).resolves.toBe("hello");
    await expect(kvs.set("other", "value")).rejects.toThrow(InvalidInputError);
    await expect(kvs.get("other")).rejects.toThrow(InvalidInputError);
    await expect(kvs.has("other")).rejects.toThrow(InvalidInputError);
    await expect(kvs.delete("other")).rejects.toThrow(InvalidInputError);

    // 後片付け
    await kvs.close();
  });

  test("スキーマ定義が不正なとき InvalidInputError を投げる", ({ expect }) => {
    // 準備と実行と検証
    expect(() => UniKvs.config({ schema: { message: "invalid" } } as never)).toThrow(
      InvalidInputError,
    );
  });
});
