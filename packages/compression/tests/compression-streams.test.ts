import type { IMiddleware } from "@unikvs/core";
import {
  readAll,
  createNext,
  sourceFrom,
  concatBytes,
  splitIntoChunks,
  createDecodeContext,
  createEncodeContext,
  createPseudoRandomBytes,
  createDecodeStreamContext,
  createEncodeStreamContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import Compression from "../src/compression.js";
import { FORMATS } from "./helpers.js";

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
 * 読み取り中に起きたエラーを握り潰さずに観測しつつ、読み取れたデータをすべて集めます。
 * ストリームの読み取り時のエラーを検証するために使用します。
 */
async function collectSettled<T>(stream: ReadableStream<T>): Promise<{
  readError: unknown;
  writeError: undefined;
  outputChunks: T[];
}> {
  const outputChunks: T[] = [];
  let readError: unknown;
  const reader = stream.getReader();

  try {
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

/**
 * チャンク列を圧縮ストリームに流し、出力されたチャンクを返します。
 */
function pumpEncode(
  compression: Compression,
  chunks: readonly Uint8Array<ArrayBuffer>[],
): Promise<{
  readError: unknown;
  writeError: undefined;
  outputChunks: Uint8Array<ArrayBuffer>[];
}> {
  const c = createEncodeStreamContext(sourceFrom(chunks));

  return compression
    .encodeStream(c as ByteEncodeStreamContext, createNext())
    .then(() => collectSettled(c.destination as ReadableStream<Uint8Array<ArrayBuffer>>));
}

/**
 * チャンク列を展開ストリームに流し、出力されたチャンクを返します。
 */
function pumpDecode(
  compression: Compression,
  chunks: readonly Uint8Array<ArrayBuffer>[],
): Promise<{
  readError: unknown;
  writeError: undefined;
  outputChunks: Uint8Array<ArrayBuffer>[];
}> {
  const c = createDecodeStreamContext(sourceFrom(chunks));

  return compression
    .decodeStream(c as ByteDecodeStreamContext, createNext())
    .then(() => collectSettled(c.destination as ReadableStream<Uint8Array<ArrayBuffer>>));
}

/**
 * チャンク列を圧縮ストリームと展開ストリームに順に流して往復させます。
 */
async function roundTripStream(
  compression: Compression,
  chunks: readonly Uint8Array<ArrayBuffer>[],
): Promise<Uint8Array<ArrayBuffer>[]> {
  const encodedContext = createEncodeStreamContext(sourceFrom(chunks));
  await compression.encodeStream(encodedContext as ByteEncodeStreamContext, createNext());

  const decodedContext = createDecodeStreamContext(
    encodedContext.destination as ReadableStream<Uint8Array<ArrayBuffer>>,
  );
  await compression.decodeStream(decodedContext as ByteDecodeStreamContext, createNext());

  return readAll(decodedContext.destination as ReadableStream<Uint8Array<ArrayBuffer>>);
}

describe.each(FORMATS)("%s 形式のストリーム", (format) => {
  test("空のストリームを圧縮して展開すると空のデータに戻る", async ({ expect }) => {
    // 準備：
    const compression = new Compression(format);

    // 実行：
    const encoded = await pumpEncode(compression, []);
    const decoded = await decode(compression, concatBytes(encoded.outputChunks));

    // 検証：
    expect(encoded.writeError).toBeUndefined();
    expect(encoded.readError).toBeUndefined();
    expect(decoded).toStrictEqual(new Uint8Array(0));
  });

  test("1 チャンクのストリームを往復すると元のデータに戻る", async ({ expect }) => {
    // 準備：
    const compression = new Compression(format);
    const input = createPseudoRandomBytes(1024, 11);

    // 実行：
    const decodedChunks = await roundTripStream(compression, [input]);

    // 検証：
    expect(concatBytes(decodedChunks)).toStrictEqual(input);
  });

  test("大きさが不揃いな複数チャンクのストリームを往復すると元のデータに戻る", async ({
    expect,
  }) => {
    // 準備：
    const compression = new Compression(format);
    const input = createPseudoRandomBytes(8192, 12);
    const chunks = [
      input.subarray(0, 13),
      input.subarray(13, 4097),
      input.subarray(4097, 8191),
      input.subarray(8191),
    ];

    // 実行：
    const decodedChunks = await roundTripStream(compression, chunks);

    // 検証：
    expect(concatBytes(decodedChunks)).toStrictEqual(input);
  });

  test("100 個の小さなチャンクのストリームを往復すると元のデータに戻る", async ({ expect }) => {
    // 準備：
    const compression = new Compression(format);
    const input = createPseudoRandomBytes(1000, 13);
    const chunks = Array.from({ length: 100 }, (_, index) =>
      input.subarray(index * 10, index * 10 + 10),
    );

    // 実行：
    const decodedChunks = await roundTripStream(compression, chunks);

    // 検証：
    expect(concatBytes(decodedChunks)).toStrictEqual(input);
  });

  test("1 バイトずつ encode して 7 バイトずつ decode しても元のデータに戻る", async ({
    expect,
  }) => {
    // 準備：
    const compression = new Compression(format);
    const input = createPseudoRandomBytes(512, 14);

    // 実行：
    const encoded = await pumpEncode(compression, splitIntoChunks(input, 1));
    const decoded = await pumpDecode(
      compression,
      splitIntoChunks(concatBytes(encoded.outputChunks), 7),
    );

    // 検証：
    expect(encoded.writeError).toBeUndefined();
    expect(encoded.readError).toBeUndefined();
    expect(decoded.writeError).toBeUndefined();
    expect(decoded.readError).toBeUndefined();
    expect(concatBytes(decoded.outputChunks)).toStrictEqual(input);
  });

  test("単体の encode 結果を小さなチャンクで展開しても元のデータに戻る", async ({ expect }) => {
    // 準備：
    const compression = new Compression(format);
    const input = createPseudoRandomBytes(2048, 15);
    const encoded = await encode(compression, input);

    // 実行：
    const decoded = await pumpDecode(compression, splitIntoChunks(encoded, 13));

    // 検証：
    expect(decoded.writeError).toBeUndefined();
    expect(decoded.readError).toBeUndefined();
    expect(concatBytes(decoded.outputChunks)).toStrictEqual(input);
  });

  test("encodeStream の出力を単体の decode で展開すると元のデータに戻る", async ({ expect }) => {
    // 準備：
    const compression = new Compression(format);
    const input = createPseudoRandomBytes(2048, 16);

    // 実行：
    const encoded = await pumpEncode(compression, [input]);
    const decoded = await decode(compression, concatBytes(encoded.outputChunks));

    // 検証：
    expect(encoded.writeError).toBeUndefined();
    expect(encoded.readError).toBeUndefined();
    expect(decoded).toStrictEqual(input);
  });
});
