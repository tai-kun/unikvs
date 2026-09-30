import { describe } from "vitest";

import Debug, { type DebugInfoArgs } from "../src/debug.js";
import { createRecordsTest, pipeChunks } from "./_helpers.js";
import { forCases, forCasesAsync, type Random } from "./_random.js";

const SEED = 20260930;
const CASE_COUNT = 100;
const STREAM_CASE_COUNT = 50;

const test = createRecordsTest();

/**
 * 既定のデバッグ情報の引数を組み立てます。
 * ケースごとにデータだけを差し替えて検証するために使用します。
 */
function argsFor(data: unknown): DebugInfoArgs {
  return { vars: {}, action: undefined, key: undefined, direction: "write", data };
}

const VIEW_FACTORIES = [
  {
    name: "Uint8Array",
    bytesPerElement: 1,
    create: (values: readonly number[]) => new Uint8Array(values),
  },
  {
    name: "Uint16Array",
    bytesPerElement: 2,
    create: (values: readonly number[]) => new Uint16Array(values),
  },
  {
    name: "Int32Array",
    bytesPerElement: 4,
    create: (values: readonly number[]) => new Int32Array(values),
  },
  {
    name: "Float64Array",
    bytesPerElement: 8,
    create: (values: readonly number[]) => new Float64Array(values),
  },
] as const;

const VALUE_KINDS = [
  "undefined",
  "null",
  "boolean",
  "number",
  "bigint",
  "string",
  "object",
  "array",
  "date",
  "map",
  "set",
  "uint8Array",
  "uint16Array",
  "dataView",
  "function",
  "symbol",
] as const;

type ValueKind = (typeof VALUE_KINDS)[number];

const PLAIN_KINDS = [
  "undefined",
  "null",
  "boolean",
  "number",
  "bigint",
  "symbol",
  "object",
  "array",
  "date",
  "map",
  "set",
  "function",
] as const satisfies readonly ValueKind[];

/**
 * 指定した種類のランダムな値を生成します。
 * 入れ子は depth で制限し、値の生成が止まらなくなるのを防ぐために使用します。
 */
function randomOfKind(random: Random, kind: ValueKind, depth: number): unknown {
  switch (kind) {
    case "undefined":
      return undefined;
    case "null":
      return null;
    case "boolean":
      return random.bool();
    case "number":
      return random.pick([
        0,
        -0,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        random.int(-1_000_000, 1_000_000),
        random.next(),
      ]);
    case "bigint":
      return BigInt(random.int(-1_000_000, 1_000_000));
    case "string":
      return random.string(random.uint(8));
    case "object":
      return depth >= 2 ? {} : { value: randomValue(random, depth + 1) };
    case "array":
      return depth >= 2
        ? []
        : random.array(random.uint(3), (child) => randomValue(child, depth + 1));
    case "date":
      return new Date(random.uint(4_000_000_000));
    case "map":
      return new Map([[random.string(3), randomValue(random, depth + 1)]]);
    case "set":
      return new Set([randomValue(random, depth + 1)]);
    case "uint8Array":
      return random.bytes(random.uint(8));
    case "uint16Array":
      return Uint16Array.from(random.array(random.uint(4), () => random.uint(0xffff)));
    case "dataView":
      return new DataView(random.bytes(random.uint(8)).buffer);
    case "function":
      return () => random.next();
    case "symbol":
      return Symbol(random.string(4));
  }
}

/**
 * 任意の型の値をランダムに生成します。
 * encode/decode の透過性を幅広い入力で検証するために使用します。
 */
function randomValue(random: Random, depth = 0): unknown {
  return randomOfKind(random, random.pick(VALUE_KINDS), depth);
}

/**
 * 文字列でも ArrayBuffer ビューでもない値をランダムに生成します。
 * 既定のデバッグ情報が type だけを返すことを検証するために使用します。
 */
function randomPlainValue(random: Random, depth = 0): unknown {
  return randomOfKind(random, random.pick(PLAIN_KINDS), depth);
}

describe("Debug (決定的ファズ)", () => {
  test("encode は任意のデータを同一参照で返す", ({ expect }) => {
    // 準備
    const debug = new Debug();

    // 実行と検証
    forCases(SEED, CASE_COUNT, (random) => {
      const data = randomValue(random);

      expect(debug.encode({ vars: {}, data })).toBe(data);
    });
  });

  test("decode は任意のデータを同一参照で返す", ({ expect }) => {
    // 準備
    const debug = new Debug();

    // 実行と検証
    forCases(SEED + 1, CASE_COUNT, (random) => {
      const data = randomValue(random);

      expect(debug.decode({ vars: {}, data })).toBe(data);
    });
  });

  test("文字列の長さは UTF-16 コード単位の数と一致する", ({ expect }) => {
    // 実行と検証
    forCases(SEED + 2, CASE_COUNT, (random) => {
      const data = random.string(random.uint(32));

      expect(Debug.getDefaultDebugInfo(argsFor(data))).toStrictEqual({
        type: "string",
        length: data.length,
      });
    });
  });

  test("TypedArray のバイト数は要素数と要素サイズから計算した値に一致する", ({ expect }) => {
    // 実行と検証
    forCases(SEED + 3, CASE_COUNT, (random) => {
      const factory = random.pick(VIEW_FACTORIES);
      const values = random.array(random.uint(32), () => random.int(-1_000_000, 1_000_000));
      const data = factory.create(values);

      expect(Debug.getDefaultDebugInfo(argsFor(data))).toStrictEqual({
        type: factory.name,
        byteLength: values.length * factory.bytesPerElement,
      });
    });
  });

  test("DataView のバイト数はバッキングバッファーの長さと一致する", ({ expect }) => {
    // 実行と検証
    forCases(SEED + 4, CASE_COUNT, (random) => {
      const byteLength = random.uint(128);
      const data = new DataView(new ArrayBuffer(byteLength));

      expect(Debug.getDefaultDebugInfo(argsFor(data))).toStrictEqual({
        type: "DataView",
        byteLength,
      });
    });
  });

  test("文字列でもビューでもないデータには type だけを返す", ({ expect }) => {
    // 実行と検証
    forCases(SEED + 5, CASE_COUNT, (random) => {
      const data = randomPlainValue(random);
      const info = Debug.getDefaultDebugInfo(argsFor(data));

      expect(Object.keys(info)).toStrictEqual(["type"]);
      expect(info["type"]).toBeTypeOf("string");
    });
  });

  test("ストリームは任意のチャンクを同一参照で通し、チャンクごとに 1 件記録する", async ({
    expect,
    records,
  }) => {
    // 準備
    const debug = new Debug();
    const vars = { "unikvs:action": "stream", "unikvs:key": "stream" };

    // 実行と検証
    await forCasesAsync(SEED + 6, STREAM_CASE_COUNT, async (random) => {
      records.length = 0;
      const chunks = random.array(random.uint(8), (child) => randomValue(child));

      const output = await pipeChunks<unknown>(debug.getDecodable({ vars }), chunks);

      expect(output).toHaveLength(chunks.length);
      for (const [index, chunk] of chunks.entries()) {
        expect(output[index]).toBe(chunk);
      }
      expect(records).toHaveLength(chunks.length);
    });
  });
});
