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
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

// oxlint-disable unicorn/number-literal-case
import Cbor from "../src/cbor.js";

const cbor = new Cbor();
const SEED = 20_240_927;
const CASE_COUNT = 50;
const STREAM_CASE_COUNT = 30;

/**
 * 往復対象になる決定的なランダム値を生成します。
 * ネストが深くなりすぎないよう、深さ 3 に達したらプリミティブのみを選びます。
 */
function generateValue(random: Random, depth = 0): unknown {
  const primitiveKinds = ["null", "bool", "int", "float", "string", "bigint", "bytes"] as const;
  const compositeKinds = ["array", "object", "map", "set", "date", "regexp", "typedArray"] as const;
  const kinds = depth >= 3 ? primitiveKinds : ([...primitiveKinds, ...compositeKinds] as const);
  const kind = random.pick(kinds);

  switch (kind) {
    case "null": {
      return null;
    }

    case "bool": {
      return random.bool();
    }

    case "int": {
      return random.int(-1000, 1000);
    }

    case "float": {
      return random.next() * 1000 - 500;
    }

    case "string": {
      return random.string(random.uint(12));
    }

    case "bigint": {
      // 任意の大きさの bigint が bigint のまま往復することを確認します。
      if (random.bool()) {
        return BigInt(random.int(-1_000_000, 1_000_000));
      }

      return (
        ((BigInt(random.uint(0xff_ff_ff_ff)) << 64n) + BigInt(random.uint(0xff_ff_ff_ff))) *
        (random.bool() ? 1n : -1n)
      );
    }

    case "bytes": {
      return random.bytes(random.uint(16));
    }

    case "array": {
      return random.array(random.uint(4), (childRandom) => generateValue(childRandom, depth + 1));
    }

    case "object": {
      return Object.fromEntries(
        random.array(random.uint(4), (childRandom): [string, unknown] => [
          `k${childRandom.string(1 + childRandom.uint(4))}`,
          generateValue(childRandom, depth + 1),
        ]),
      );
    }

    case "map": {
      return new Map(
        random.array(random.uint(4), (childRandom): [unknown, unknown] => [
          generateValue(childRandom, depth + 1),
          generateValue(childRandom, depth + 1),
        ]),
      );
    }

    case "set": {
      return new Set(
        random.array(random.uint(4), (childRandom) => generateValue(childRandom, depth + 1)),
      );
    }

    case "date": {
      return new Date(random.int(-4_000_000_000_000, 4_000_000_000_000));
    }

    case "regexp": {
      return new RegExp(
        random.string(1 + random.uint(6)),
        random.pick(["", "g", "i", "m", "s", "u", "y", "gi", "gimsuy"]),
      );
    }

    case "typedArray": {
      const length = random.uint(8);
      const typedArrayKind = random.pick(["int16", "float64"] as const);

      if (typedArrayKind === "int16") {
        return new Int16Array(
          random.array(length, (childRandom) => childRandom.int(-32_768, 32_767)),
        );
      }

      return new Float64Array(
        random.array(length, (childRandom) => childRandom.next() * 1000 - 500),
      );
    }

    default: {
      throw new Error(`Unknown kind: ${String(kind)}`);
    }
  }
}

/**
 * バイト列を 1 バイト以上 8 バイト以下のランダムな長さで分割します。
 */
function splitRandomly(random: Random, bytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer>[] {
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;

  while (offset < bytes.length) {
    const size = 1 + random.uint(8);
    chunks.push(bytes.subarray(offset, Math.min(offset + size, bytes.length)));
    offset += size;
  }

  return chunks;
}

/**
 * 値を CBOR のバイト列へ変換します。
 */
async function encode(data: unknown): Promise<Uint8Array<ArrayBuffer>> {
  const c = createEncodeContext(data);
  await cbor.encode(c as IMiddleware.EncodeContext, createNext());

  return c.destination;
}

/**
 * バイト列のチャンク列をデコードストリームに流し、出力された値を返します。
 */
async function decodeChunks(chunks: readonly Uint8Array<ArrayBuffer>[]): Promise<unknown[]> {
  const c = createDecodeStreamContext(sourceFrom(chunks));
  await cbor.decodeStream(c as IMiddleware.DecodeStreamContext, createNext());

  return readAll(c.destination);
}

describe("決定的ファズテスト", () => {
  test("ランダムな値を一括で往復すると元の値に戻る", async ({ expect }) => {
    // 実行と検証：
    await forCasesAsync(SEED, CASE_COUNT, async (random, index) => {
      const value = generateValue(random);

      const encodeContext = createEncodeContext(value);
      await cbor.encode(encodeContext as IMiddleware.EncodeContext, createNext());

      const decodeContext = createDecodeContext(encodeContext.destination);
      await cbor.decode(decodeContext as IMiddleware.DecodeContext, createNext());
      expect(decodeContext.destination, `case ${index}`).toStrictEqual(value);
    });
  });

  test("ランダムな値をランダムなチャンクに分割してストリームで往復すると元の値に戻る", async ({
    expect,
  }) => {
    // 実行と検証：
    await forCasesAsync(SEED + 1, STREAM_CASE_COUNT, async (random, index) => {
      const value = generateValue(random);
      const encoded = await encode(value);
      const chunks = splitRandomly(random, encoded);

      const decoded = await decodeChunks(chunks);
      expect(decoded, `case ${index}`).toStrictEqual([value]);
    });
  });

  test("ランダムな値のシーケンスをストリームで往復すると元の値に戻る", async ({ expect }) => {
    // 実行と検証：
    await forCasesAsync(SEED + 2, STREAM_CASE_COUNT, async (random, index) => {
      const values = random.array(random.uint(6), (childRandom) => generateValue(childRandom));
      const encoded = concatBytes(await Promise.all(values.map((value) => encode(value))));
      const chunks = splitRandomly(random, encoded);

      const decoded = await decodeChunks(chunks);
      expect(decoded, `case ${index}`).toStrictEqual(values);
    });
  });
});
