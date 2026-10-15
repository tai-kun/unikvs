import type { IMiddleware } from "@unikvs/core";
import { forCasesAsync, type Random } from "@unikvs/testing";
import {
  concatBytes,
  createDecodeContext,
  createDecodeStreamContext,
  createEncodeContext,
  createEncodeStreamContext,
  createNext,
  readAll,
  sourceFrom,
  splitIntoChunks,
} from "@unikvs/testing";
import { describe, test } from "vitest";

import Json from "../src/json.js";

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

      const encodeContext = createEncodeContext(value);
      await json.encode(encodeContext as IMiddleware.EncodeContext, createNext());
      const decodeContext = createDecodeContext(encodeContext.destination);
      await json.decode(decodeContext as IMiddleware.DecodeContext, createNext());

      expect(decodeContext.destination).toStrictEqual(value);
    });
  });

  test("ランダムな値を JSONL へエンコードし、任意のチャンクでデコードすると元の値に戻る", async ({
    expect,
  }) => {
    // 実行と検証
    await forCasesAsync(SEED, STREAM_CASE_COUNT, async (random) => {
      const json = new Json();
      const values = random.array(random.int(0, 6), (child) => randomValue(child));

      const encodeContext = createEncodeStreamContext(sourceFrom(values));
      await json.encodeStream(encodeContext as IMiddleware.EncodeStreamContext, createNext());
      const encoded = await readAll(
        encodeContext.destination as ReadableStream<Uint8Array<ArrayBuffer>>,
      );

      const bytes = concatBytes(encoded);
      const size = random.int(1, 8);
      const decodeContext = createDecodeStreamContext(sourceFrom(splitIntoChunks(bytes, size)));
      await json.decodeStream(decodeContext as IMiddleware.DecodeStreamContext, createNext());
      const decoded = await readAll(decodeContext.destination);

      expect(decoded).toStrictEqual(values);
    });
  });
});
