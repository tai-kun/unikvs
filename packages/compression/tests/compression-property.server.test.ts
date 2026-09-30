import { describe, test } from "vitest";

import Compression from "../src/compression.js";
import { forCasesAsync } from "./_random.js";
import { FORMATS, concatBytes, pumpThrough } from "./helpers.js";

const SEED = 20240927;
const CASE_COUNT = 50;
const STREAM_CASE_COUNT = 30;

describe("決定的ファズテスト", () => {
  test("ランダムなバイト列をランダムな形式で往復すると元のデータに戻る", async ({ expect }) => {
    // 実行と検証
    await forCasesAsync(SEED, CASE_COUNT, async (random) => {
      const format = random.pick(FORMATS);
      const input = random.bytes(random.uint(2048));
      const compression = new Compression(format);

      const encoded = await compression.encode({ data: input });
      const decoded = await compression.decode({ data: encoded });

      expect(decoded).toStrictEqual(input);
    });
  });

  test("ランダムなチャンク列をストリームで往復すると元のデータに戻る", async ({ expect }) => {
    // 実行と検証
    await forCasesAsync(SEED, STREAM_CASE_COUNT, async (random) => {
      const format = random.pick(FORMATS);
      const chunks = random.array(random.int(0, 8), (chunkRandom) =>
        chunkRandom.bytes(chunkRandom.uint(512)),
      );
      const compression = new Compression(format);

      const encoded = await pumpThrough(compression.getEncodable(), chunks);
      const decoded = await pumpThrough(compression.getDecodable(), encoded.outputChunks);

      expect(encoded.writeError).toBeUndefined();
      expect(encoded.readError).toBeUndefined();
      expect(decoded.writeError).toBeUndefined();
      expect(decoded.readError).toBeUndefined();
      expect(concatBytes(decoded.outputChunks)).toStrictEqual(concatBytes(chunks));
    });
  });
});
