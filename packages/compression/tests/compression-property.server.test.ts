import type { IMiddleware } from "@unikvs/core";
import {
  concatBytes,
  createDecodeContext,
  createDecodeStreamContext,
  createEncodeContext,
  createEncodeStreamContext,
  createNext,
  forCasesAsync,
  sourceFrom,
} from "@unikvs/testing";
import { describe, test } from "vitest";

import Compression from "../src/compression.js";
import { FORMATS } from "./helpers.js";

const SEED = 20240927;
const CASE_COUNT = 50;
const STREAM_CASE_COUNT = 30;

type ByteContext = IMiddleware.EncodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>;
type ByteDecodeContext = IMiddleware.DecodeContext<
  Uint8Array<ArrayBuffer>,
  Uint8Array<ArrayBuffer>
>;
type ByteEncodeStreamContext = IMiddleware.EncodeStreamContext<
  Uint8Array<ArrayBuffer>,
  Uint8Array<ArrayBuffer>
>;
type ByteDecodeStreamContext = IMiddleware.DecodeStreamContext<
  Uint8Array<ArrayBuffer>,
  Uint8Array<ArrayBuffer>
>;

/**
 * バイト列を圧縮して返します。
 */
async function encode(
  compression: Compression,
  data: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const c = createEncodeContext(data);
  await compression.encode(c as ByteContext, createNext());

  return c.destination;
}

/**
 * 圧縮されたバイト列を展開して返します。
 */
async function decode(
  compression: Compression,
  data: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const c = createDecodeContext(data);
  await compression.decode(c as ByteDecodeContext, createNext());

  return c.destination;
}

/**
 * チャンク列を圧縮ストリームと展開ストリームに順に流して往復させます。
 */
async function roundTripStream(
  compression: Compression,
  chunks: readonly Uint8Array<ArrayBuffer>[],
): Promise<{
  outputChunks: Uint8Array<ArrayBuffer>[];
  writeError: undefined;
  readError: unknown;
}> {
  const encodedContext = createEncodeStreamContext(sourceFrom(chunks));
  await compression.encodeStream(encodedContext as ByteEncodeStreamContext, createNext());
  const decodedContext = createDecodeStreamContext(
    encodedContext.destination as ReadableStream<Uint8Array<ArrayBuffer>>,
  );
  await compression.decodeStream(decodedContext as ByteDecodeStreamContext, createNext());

  const outputChunks: Uint8Array<ArrayBuffer>[] = [];
  let readError: unknown;

  try {
    const reader = (
      decodedContext.destination as ReadableStream<Uint8Array<ArrayBuffer>>
    ).getReader();

    for (;;) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      outputChunks.push(value);
    }
  } catch (ex) {
    readError = ex;
  }

  return { outputChunks, writeError: undefined, readError };
}

describe("決定的ファズテスト", () => {
  test("ランダムなバイト列をランダムな形式で往復すると元のデータに戻る", async ({ expect }) => {
    // 実行と検証
    await forCasesAsync(SEED, CASE_COUNT, async (random) => {
      const format = random.pick(FORMATS);
      const input = random.bytes(random.uint(2048));
      const compression = new Compression(format);

      const encoded = await encode(compression, input);
      const decoded = await decode(compression, encoded);

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

      const decoded = await roundTripStream(compression, chunks);

      expect(decoded.writeError).toBeUndefined();
      expect(decoded.readError).toBeUndefined();
      expect(concatBytes(decoded.outputChunks)).toStrictEqual(concatBytes(chunks));
    });
  });
});
