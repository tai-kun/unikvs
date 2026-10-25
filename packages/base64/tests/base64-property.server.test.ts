import type { IMiddleware } from "@unikvs/core";
import {
  type Random,
  createNext,
  sourceFrom,
  concatBytes,
  forCasesAsync,
  createDecodeContext,
  createEncodeContext,
  createDecodeStreamContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import Base64 from "../src/base64.js";

const SEED = 20_240_928;
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

/**
 * バイト列をエンコードして返します。
 */
async function encode(
  target: Base64,
  data: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const c = createEncodeContext(data);
  await target.encode(
    c as IMiddleware.EncodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
    createNext(),
  );

  return c.destination;
}

/**
 * base64 化されたバイト列をデコードして返します。
 */
async function decode(
  target: Base64,
  data: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const c = createDecodeContext(data);
  await target.decode(
    c as IMiddleware.DecodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
    createNext(),
  );

  return c.destination;
}

/**
 * チャンク列をデコードストリームに流し、出力されたチャンクを返します。
 */
async function pumpDecode(
  target: Base64,
  chunks: readonly Uint8Array<ArrayBuffer>[],
): Promise<{
  readError: unknown;
  writeError: undefined;
  outputChunks: Uint8Array<ArrayBuffer>[];
}> {
  const c = createDecodeStreamContext(sourceFrom(chunks));
  await target.decodeStream(
    c as IMiddleware.DecodeStreamContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
    createNext(),
  );

  const outputChunks: Uint8Array<ArrayBuffer>[] = [];
  let readError: unknown;

  try {
    const reader = (c.destination as ReadableStream<Uint8Array<ArrayBuffer>>).getReader();

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

  return {
    readError,
    writeError: undefined,
    outputChunks,
  };
}

describe("決定的ファズテスト", () => {
  test("ランダムなバイト列を一括で往復すると元の値に戻る", async ({ expect }) => {
    // 実行と検証：
    await forCasesAsync(SEED, CASE_COUNT, async (random) => {
      const base64 = new Base64();
      const input = randomBytes(random);

      const encoded = await encode(base64, input);
      const decoded = await decode(base64, encoded);
      expect(decoded).toStrictEqual(input);
    });
  });

  test("ランダムなバイト列を encode し任意のチャンクで decode すると元の値に戻る", async ({
    expect,
  }) => {
    // 実行と検証：
    await forCasesAsync(SEED, STREAM_CASE_COUNT, async (random) => {
      const base64 = new Base64();
      const input = randomBytes(random);

      const encoded = await encode(base64, input);
      const chunks = splitRandomly(random, encoded);
      const decoded = await pumpDecode(base64, chunks);
      expect(decoded.writeError).toBeUndefined();
      expect(decoded.readError).toBeUndefined();
      expect(concatBytes(decoded.outputChunks)).toStrictEqual(input);
    });
  });
});
