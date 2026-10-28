import type { IMiddleware } from "@unikvs/core";
import {
  type Random,
  readAll,
  forCases,
  createNext,
  sourceFrom,
  forCasesAsync,
  createDecodeStreamContext,
} from "@unikvs/testing";
import { describe } from "vite-plus/test";

import Debug, { type DebugInfoArgs } from "../src/debug.js";
import { decode, encode, createRecordsTest } from "./_helpers.js";

const SEED = 20_260_930;
const CASE_COUNT = 100;
const STREAM_CASE_COUNT = 50;

const test = createRecordsTest();

/**
 * 既定のデバッグ情報の引数を組み立てます。
 * ケースごとにデータだけを差し替えて検証するために使用します。
 */
function argsFor(data: unknown): DebugInfoArgs {
  return {
    key: "key",
    data,
    action: "set",
    direction: "write",
  };
}

const VIEW_FACTORIES = [
  {
    name: "Uint8Array",
    create: (values: readonly number[]): Uint8Array => new Uint8Array(values),
    bytesPerElement: 1,
  },
  {
    name: "Uint16Array",
    create: (values: readonly number[]): Uint16Array => new Uint16Array(values),
    bytesPerElement: 2,
  },
  {
    name: "Int32Array",
    create: (values: readonly number[]): Int32Array => new Int32Array(values),
    bytesPerElement: 4,
  },
  {
    name: "Float64Array",
    create: (values: readonly number[]): Float64Array => new Float64Array(values),
    bytesPerElement: 8,
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
  let value: unknown;

  switch (kind) {
    case "undefined": {
      value = undefined;
      break;
    }

    case "null": {
      value = null;
      break;
    }

    case "boolean": {
      value = random.bool();
      break;
    }

    case "number": {
      value = random.pick([
        0,
        -0,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        random.int(-1_000_000, 1_000_000),
        random.next(),
      ]);
      break;
    }

    case "bigint": {
      value = BigInt(random.int(-1_000_000, 1_000_000));
      break;
    }

    case "string": {
      value = random.string(random.uint(8));
      break;
    }

    case "object": {
      value = depth >= 2 ? {} : { value: randomValue(random, depth + 1) };
      break;
    }

    case "array": {
      value =
        depth >= 2 ? [] : random.array(random.uint(3), (child) => randomValue(child, depth + 1));
      break;
    }

    case "date": {
      value = new Date(random.uint(4_000_000_000));
      break;
    }

    case "map": {
      value = new Map([[random.string(3), randomValue(random, depth + 1)]]);
      break;
    }

    case "set": {
      value = new Set([randomValue(random, depth + 1)]);
      break;
    }

    case "uint8Array": {
      value = random.bytes(random.uint(8));
      break;
    }

    case "uint16Array": {
      value = Uint16Array.from(random.array(random.uint(4), () => random.uint(65_535)));
      break;
    }

    case "dataView": {
      value = new DataView(random.bytes(random.uint(8)).buffer);
      break;
    }

    case "function": {
      value = (): number => random.next();
      break;
    }

    case "symbol": {
      value = Symbol(random.string(4));
      break;
    }

    default: {
      throw new Error(`未知の値の種類です: ${String(kind)}`);
    }
  }

  return value;
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
  test("encode は任意のデータを同一参照で返す", async ({ expect }) => {
    // 準備：
    const debug = new Debug();

    // 実行と検証：
    await forCasesAsync(SEED, CASE_COUNT, async (random) => {
      const data = randomValue(random);
      expect(await encode(debug, data)).toBe(data);
    });
  });

  test("decode は任意のデータを同一参照で返す", async ({ expect }) => {
    // 準備：
    const debug = new Debug();

    // 実行と検証：
    await forCasesAsync(SEED + 1, CASE_COUNT, async (random) => {
      const data = randomValue(random);
      expect(await decode(debug, data)).toBe(data);
    });
  });

  test("文字列の長さは UTF-16 コード単位の数と一致する", ({ expect }) => {
    // 実行と検証：
    forCases(SEED + 2, CASE_COUNT, (random) => {
      const data = random.string(random.uint(32));
      expect(Debug.getDefaultDebugInfo(argsFor(data))).toStrictEqual({
        type: "string",
        length: data.length,
      });
    });
  });

  test("TypedArray のバイト数は要素数と要素サイズから計算した値に一致する", ({ expect }) => {
    // 実行と検証：
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
    // 実行と検証：
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
    // 実行と検証：
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
    // 準備：
    const debug = new Debug();

    // 実行と検証：
    await forCasesAsync(SEED + 6, STREAM_CASE_COUNT, async (random) => {
      records.length = 0;
      const chunks = random.array(random.uint(8), (child) => randomValue(child));

      const c = createDecodeStreamContext(sourceFrom(chunks), "stream");
      await debug.decodeStream(c as IMiddleware.DecodeStreamContext, createNext());

      const output = await readAll(c.destination as ReadableStream<unknown>);
      expect(output).toHaveLength(chunks.length);

      for (const [index, chunk] of chunks.entries()) {
        expect(output[index]).toBe(chunk);
      }

      expect(records).toHaveLength(chunks.length);
    });
  });
});
