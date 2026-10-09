import { describe, test } from "vitest";

import Base64 from "../src/base64.js";
import { forCasesAsync, type Random } from "./_random.js";
import { concatBytes, pumpThrough } from "./helpers.js";

const SEED = 20240928;
const CASE_COUNT = 50;
const STREAM_CASE_COUNT = 30;

/**
 * ランダムな長さのバイト列を生成します。
 */
function randomBytes(random: Random): Uint8Array<ArrayBuffer> {
  return random.bytes(random.int(0, 512));
}

/**
 * バイト列を 1 バイト以上 8 バイト以下のランダムな長さで分割します。
 */
function splitRandomly(random: Random, bytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer>[] {
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;

  while (offset < bytes.length) {
    const size = random.int(1, 8);
    chunks.push(bytes.subarray(offset, Math.min(offset + size, bytes.length)));
    offset += size;
  }

  return chunks;
}

describe("決定的ファズテスト", () => {
  test("ランダムなバイト列を一括で往復すると元の値に戻る", async ({ expect }) => {
    // 実行と検証
    await forCasesAsync(SEED, CASE_COUNT, async (random) => {
      const base64 = new Base64();
      const input = randomBytes(random);

      const encoded = base64.encode({ data: input });
      const decoded = base64.decode({ data: encoded });

      expect(decoded).toStrictEqual(input);
    });
  });

  test("ランダムなバイト列を encode し任意のチャンクで decode すると元の値に戻る", async ({
    expect,
  }) => {
    // 実行と検証
    await forCasesAsync(SEED, STREAM_CASE_COUNT, async (random) => {
      const base64 = new Base64();
      const input = randomBytes(random);

      const encoded = base64.encode({ data: input });
      const chunks = splitRandomly(random, encoded);
      const decoded = await pumpThrough(base64.getDecodable(), chunks);

      expect(decoded.writeError).toBeUndefined();
      expect(decoded.readError).toBeUndefined();
      expect(concatBytes(decoded.outputChunks)).toStrictEqual(input);
    });
  });
});
