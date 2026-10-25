import type { IMiddleware } from "@unikvs/core";
import {
  type Random,
  readAll,
  createNext,
  sourceFrom,
  concatBytes,
  forCasesAsync,
  createDecodeContext,
  createEncodeContext,
  createDecodeStreamContext,
  createEncodeStreamContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import Superjson from "../src/superjson.js";

/**
 * 葉として生成できる値の種類です。
 */
const LEAF_KINDS = ["undefined", "null", "boolean", "number", "string", "bigint", "date"] as const;

/**
 * 入れ子を伴う値の種類です。
 */
const NESTED_KINDS = [...LEAF_KINDS, "array", "object", "map", "set", "bytes"] as const;

/**
 * 境界や特殊ケースを含む文字列の一覧です。
 */
const EXOTIC_STRINGS = ["", "日本語", "🎌", "\u0000", "a\nb", '"quote"', "\\backslash\\"] as const;

/**
 * 特殊な数値を含む数値を生成します。
 */
function generateNumber(random: Random): number {
  switch (random.int(0, 4)) {
    case 0: {
      return random.int(-1_000_000, 1_000_000);
    }

    case 1: {
      return random.next() * 1_000_000 - 500_000;
    }

    case 2: {
      return Number.NaN;
    }

    case 3: {
      return random.bool() ? Infinity : -Infinity;
    }

    default: {
      return -0;
    }
  }
}

/**
 * プロパティーをランダムに持つオブジェクトを生成します。
 */
function generateObject(random: Random, depth: number): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const size = random.int(0, 4);

  for (let index = 0; index < size; index++) {
    result[random.string(random.int(1, 6))] = generateValue(random, depth - 1);
  }

  return result;
}

/**
 * Map のキーとして使う値を生成します。
 * 上流の superjson が同一オブジェクト内の複数の NaN キーを欠落させるため、NaN を避けます。
 * 上流が修正されたらこの限定を外せます。
 */
function generateMapKey(random: Random, depth: number): unknown {
  for (;;) {
    const key = generateValue(random, depth);

    if (typeof key !== "number" || !Number.isNaN(key)) {
      return key;
    }
  }
}

/**
 * SuperJSON が保持できる型を組み合わせた値を決定的に生成します。
 */
function generateValue(random: Random, depth: number): unknown {
  const kind = random.pick(depth <= 0 ? LEAF_KINDS : NESTED_KINDS);
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
      value = generateNumber(random);
      break;
    }

    case "string": {
      value = random.bool() ? random.string(random.int(0, 12)) : random.pick(EXOTIC_STRINGS);
      break;
    }

    case "bigint": {
      value = BigInt(random.int(-1_000_000, 1_000_000));
      break;
    }

    case "date": {
      value = new Date(random.int(0, 4_102_444_800_000));
      break;
    }

    case "array": {
      value = random.array(random.int(0, 4), (generator) => generateValue(generator, depth - 1));
      break;
    }

    case "object": {
      value = generateObject(random, depth);
      break;
    }

    case "map": {
      value = new Map(
        random.array(random.int(0, 4), (generator) => [
          generateMapKey(generator, depth - 1),
          generateValue(generator, depth - 1),
        ]),
      );
      break;
    }

    case "set": {
      value = new Set(
        random.array(random.int(0, 4), (generator) => generateValue(generator, depth - 1)),
      );
      break;
    }

    case "bytes": {
      value = random.bytes(random.int(0, 8));
      break;
    }

    default: {
      throw new Error(`Unknown kind: ${String(kind)}`);
    }
  }

  return value;
}

describe("決定的ファズテスト", () => {
  test("ランダムな値を一括で往復すると元に戻る", async ({ expect }) => {
    // 実行と検証：
    await forCasesAsync(20_241_001, 100, async (random, index) => {
      // 準備：
      const codec = new Superjson();
      const value = generateValue(random, 4);

      // 実行：
      const encodeContext = createEncodeContext(value);
      await codec.encode(encodeContext as IMiddleware.EncodeContext, createNext());

      const decodeContext = createDecodeContext(encodeContext.destination);
      await codec.decode(decodeContext as IMiddleware.DecodeContext, createNext());

      // 検証：
      expect(decodeContext.destination, `ケース ${index}`).toStrictEqual(value);
    });
  });

  test("ランダムな値の列をランダムな境界で分割してもストリームで往復する", async ({ expect }) => {
    // 実行と検証：
    await forCasesAsync(20_241_002, 50, async (random, index) => {
      // 準備：
      const codec = new Superjson();
      const values = random.array(random.int(0, 6), (generator) => generateValue(generator, 3));

      // 実行：
      const encodeContext = createEncodeStreamContext(sourceFrom(values));
      await codec.encodeStream(encodeContext as IMiddleware.EncodeStreamContext, createNext());

      const encoded = await readAll(
        encodeContext.destination as ReadableStream<Uint8Array<ArrayBuffer>>,
      );

      const bytes = concatBytes(encoded);
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      let offset = 0;

      while (offset < bytes.length) {
        const size = random.int(1, 16);
        chunks.push(bytes.subarray(offset, Math.min(offset + size, bytes.length)));
        offset += size;
      }

      const decodeContext = createDecodeStreamContext(sourceFrom(chunks));
      await codec.decodeStream(decodeContext as IMiddleware.DecodeStreamContext, createNext());

      const decoded = await readAll(decodeContext.destination);

      // 検証：
      expect(decoded, `ケース ${index}`).toStrictEqual(values);
    });
  });

  test.fails("同一オブジェクト内の複数の NaN キーを持つ Map を往復できる", async ({ expect }) => {
    // 準備：上流 superjson@2.2.6 が 2 つ目の NaN キーを欠落させる既知の不具合の再現です。
    // 修正されると「予期せぬ成功」として失敗するため、そのときは generateMapKey の限定を外します。
    const codec = new Superjson();
    const value = {
      first: new Map<unknown, unknown>([[Number.NaN, 1]]),
      second: new Map<unknown, unknown>([[Number.NaN, 2]]),
    };

    // 実行：
    const encodeContext = createEncodeContext(value);
    await codec.encode(encodeContext as IMiddleware.EncodeContext, createNext());

    const decodeContext = createDecodeContext(encodeContext.destination);
    await codec.decode(decodeContext as IMiddleware.DecodeContext, createNext());

    // 検証：
    expect(decodeContext.destination).toStrictEqual(value);
  });
});
