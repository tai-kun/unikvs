import { describe, test } from "vitest";

import Json from "../src/json.js";
import { forCasesAsync, type Random } from "./_random.js";
import { concatBytes, pumpThrough, splitIntoChunks } from "./helpers.js";

const SEED = 20240928;
const CASE_COUNT = 50;
const STREAM_CASE_COUNT = 30;
const ALPHANUMERIC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789".split("");

/**
 * ランダムな長さの半角英数字からなる文字列を生成します。
 */
function randomString(random: Random, length: number): string {
  return random.array(length, (child) => child.pick(ALPHANUMERIC)).join("");
}

/**
 * ランダムな JSON 値を生成します。
 * ネストの深さを制限して再帰の暴走を防ぎます。
 */
function randomValue(random: Random, depth = 0): unknown {
  const leaf = (): unknown =>
    random.pick<unknown>([
      null,
      true,
      false,
      random.int(-1_000_000, 1_000_000),
      random.next(),
      randomString(random, random.uint(12)),
      random.pick(["", "日本語", "😀", "𠮷", "\n", "\r", '"', "\\"]),
    ]);

  if (depth >= 3) {
    return leaf();
  }

  switch (random.int(0, 3)) {
    case 0:
      return random.array(random.int(0, 4), (child) => randomValue(child, depth + 1));
    case 1:
      return Object.fromEntries(
        random.array(random.int(0, 4), (child) => [
          randomString(child, child.int(1, 6)),
          randomValue(child, depth + 1),
        ]),
      );
    default:
      return leaf();
  }
}

describe("決定的ファズテスト", () => {
  test("ランダムな値を一括で往復すると元の値に戻る", async ({ expect }) => {
    // 実行と検証
    await forCasesAsync(SEED, CASE_COUNT, async (random) => {
      const json = new Json();
      const value = randomValue(random);

      const encoded = json.encode({ data: value });
      const decoded = json.decode({ data: encoded });

      expect(decoded).toStrictEqual(value);
    });
  });

  test("ランダムな値を JSONL へエンコードし、任意のチャンクでデコードすると元の値に戻る", async ({
    expect,
  }) => {
    // 実行と検証
    await forCasesAsync(SEED, STREAM_CASE_COUNT, async (random) => {
      const json = new Json();
      const values = random.array(random.int(0, 6), (child) => randomValue(child));

      const encoded = await pumpThrough(json.getEncodable(), values);
      expect(encoded.writeError).toBeUndefined();
      expect(encoded.readError).toBeUndefined();

      const bytes = concatBytes(encoded.outputChunks);
      const size = random.int(1, 8);
      const decoded = await pumpThrough(json.getDecodable(), splitIntoChunks(bytes, size));

      expect(decoded.writeError).toBeUndefined();
      expect(decoded.readError).toBeUndefined();
      expect(decoded.outputChunks).toStrictEqual(values);
    });
  });
});
