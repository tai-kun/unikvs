import { test } from "vitest";

import Superjson from "../src/superjson.js";
import { forCasesAsync, type Random } from "./_random.js";
import { concatBytes, pumpThrough } from "./helpers.js";

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
    case 0:
      return random.int(-1_000_000, 1_000_000);
    case 1:
      return random.next() * 1_000_000 - 500_000;
    case 2:
      return NaN;
    case 3:
      return random.bool() ? Infinity : -Infinity;
    default:
      return -0;
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
 * SuperJSON が保持できる型を組み合わせた値を決定的に生成します。
 */
function generateValue(random: Random, depth: number): unknown {
  const kind = random.pick(depth <= 0 ? LEAF_KINDS : NESTED_KINDS);

  switch (kind) {
    case "undefined":
      return undefined;
    case "null":
      return null;
    case "boolean":
      return random.bool();
    case "number":
      return generateNumber(random);
    case "string":
      return random.bool() ? random.string(random.int(0, 12)) : random.pick(EXOTIC_STRINGS);
    case "bigint":
      return BigInt(random.int(-1_000_000, 1_000_000));
    case "date":
      return new Date(random.int(0, 4_102_444_800_000));
    case "array":
      return random.array(random.int(0, 4), (generator) => generateValue(generator, depth - 1));
    case "object":
      return generateObject(random, depth);
    case "map":
      return new Map(
        random.array(random.int(0, 4), (generator) => [
          generateValue(generator, depth - 1),
          generateValue(generator, depth - 1),
        ]),
      );
    case "set":
      return new Set(
        random.array(random.int(0, 4), (generator) => generateValue(generator, depth - 1)),
      );
    case "bytes":
      return random.bytes(random.int(0, 8));
  }
}

test("ランダムな値を一括で往復すると元に戻る", async ({ expect }) => {
  // 実行と検証
  await forCasesAsync(20241001, 100, async (random, index) => {
    // 準備
    const codec = new Superjson();
    const value = generateValue(random, 4);

    // 実行
    const decoded = codec.decode({ data: codec.encode({ data: value }) });

    // 検証
    expect(decoded, `ケース ${index}`).toStrictEqual(value);
  });
});

test("ランダムな値の列をランダムな境界で分割してもストリームで往復する", async ({ expect }) => {
  // 実行と検証
  await forCasesAsync(20241002, 50, async (random, index) => {
    // 準備
    const codec = new Superjson();
    const values = random.array(random.int(0, 6), (generator) => generateValue(generator, 3));

    // 実行
    const encoded = await pumpThrough(codec.getEncodable(), values);
    expect(encoded.writeError, `ケース ${index}`).toBeUndefined();
    expect(encoded.readError, `ケース ${index}`).toBeUndefined();

    const bytes = concatBytes(encoded.outputChunks);
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let offset = 0;
    while (offset < bytes.length) {
      const size = random.int(1, 16);
      chunks.push(bytes.subarray(offset, Math.min(offset + size, bytes.length)));
      offset += size;
    }

    const decoded = await pumpThrough(codec.getDecodable(), chunks);

    // 検証
    expect(decoded.writeError, `ケース ${index}`).toBeUndefined();
    expect(decoded.readError, `ケース ${index}`).toBeUndefined();
    expect(decoded.outputChunks, `ケース ${index}`).toStrictEqual(values);
  });
});
