// oxlint-disable unicorn/number-literal-case
import type { IMiddleware } from "@unikvs/core";
import {
  readAll,
  createNext,
  sourceFrom,
  concatBytes,
  splitIntoChunks,
  createDecodeContext,
  createEncodeContext,
  createDecodeStreamContext,
  createEncodeStreamContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import Base64Url from "../src/base64url.js";
import { Base64UrlDecodeError } from "../src/errors.js";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

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
 * バイト列をエンコードして返します。
 */
async function encode(
  target: Base64Url,
  data: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const c = createEncodeContext(data);
  await target.encode(c as ByteContext, createNext());

  return c.destination;
}

/**
 * base64url 化されたバイト列をデコードして返します。
 */
async function decode(
  target: Base64Url,
  data: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const c = createDecodeContext(data);
  await target.decode(c as ByteDecodeContext, createNext());

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
 * チャンク列をエンコードストリームに流し、出力されたチャンクを返します。
 */
function pumpEncode(
  target: Base64Url,
  chunks: readonly Uint8Array<ArrayBuffer>[],
): Promise<{
  readError: unknown;
  writeError: undefined;
  outputChunks: Uint8Array<ArrayBuffer>[];
}> {
  const c = createEncodeStreamContext(sourceFrom(chunks));

  return target
    .encodeStream(c as ByteEncodeStreamContext, createNext())
    .then(() => collectSettled(c.destination as ReadableStream<Uint8Array<ArrayBuffer>>));
}

/**
 * チャンク列をデコードストリームに流し、出力されたチャンクを返します。
 */
function pumpDecode(
  target: Base64Url,
  chunks: readonly Uint8Array<ArrayBuffer>[],
): Promise<{
  readError: unknown;
  writeError: undefined;
  outputChunks: Uint8Array<ArrayBuffer>[];
}> {
  const c = createDecodeStreamContext(sourceFrom(chunks));

  return target
    .decodeStream(c as ByteDecodeStreamContext, createNext())
    .then(() => collectSettled(c.destination as ReadableStream<Uint8Array<ArrayBuffer>>));
}

/**
 * ストリーム処理で最初に起きたエラーを返します。
 * 書き込み側と読み取り側のどちらで失敗したかによらない検証のために使用します。
 */
function streamError(result: {
  readonly readError: unknown;
  readonly writeError: unknown;
}): unknown {
  return result.writeError ?? result.readError;
}

/**
 * エンコードストリームとデコードストリームを直列に接続して往復させます。
 */
async function roundTripStream(
  target: Base64Url,
  chunks: readonly Uint8Array<ArrayBuffer>[],
): Promise<Uint8Array<ArrayBuffer>[]> {
  const encodedContext = createEncodeStreamContext(sourceFrom(chunks));
  await target.encodeStream(encodedContext as ByteEncodeStreamContext, createNext());

  const decodedContext = createDecodeStreamContext(
    encodedContext.destination as ReadableStream<Uint8Array<ArrayBuffer>>,
  );
  await target.decodeStream(decodedContext as ByteDecodeStreamContext, createNext());

  return readAll(decodedContext.destination as ReadableStream<Uint8Array<ArrayBuffer>>);
}

describe("encodeStream", () => {
  test("最終連結は一括 encode と一致する", async ({ expect }) => {
    // 準備：
    const base64url = new Base64Url();
    const chunks: Uint8Array<ArrayBuffer>[] = [
      Uint8Array.from([0x66, 0x6f]),
      Uint8Array.from([0x6f, 0x62, 0x61]),
      Uint8Array.from([0x72]),
    ];

    // 実行：
    const result = await pumpEncode(base64url, chunks);
    const expected = await encode(base64url, concatBytes(chunks));

    // 検証：
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(concatBytes(result.outputChunks)).toStrictEqual(expected);
  });

  test("空のストリームは空の出力になる", async ({ expect }) => {
    // 準備：
    const base64url = new Base64Url();

    // 実行：
    const result = await pumpEncode(base64url, []);

    // 検証：
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(result.outputChunks).toStrictEqual([]);
  });

  test("空チャンクは無視される", async ({ expect }) => {
    // 準備：
    const base64url = new Base64Url();
    const chunks: Uint8Array<ArrayBuffer>[] = [
      new Uint8Array(0),
      Uint8Array.from([0x66]),
      new Uint8Array(0),
    ];

    // 実行：
    const result = await pumpEncode(base64url, chunks);

    // 検証：
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(textDecoder.decode(concatBytes(result.outputChunks))).toBe("Zg");
  });

  test("1 バイトずつ分割しても encode できる", async ({ expect }) => {
    // 準備：
    const base64url = new Base64Url();
    const input = Uint8Array.from([0x66, 0x6f, 0x6f, 0x62, 0x61, 0x72]);

    // 実行：
    const result = await pumpEncode(base64url, splitIntoChunks(input, 1));

    // 検証：
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(concatBytes(result.outputChunks)).toStrictEqual(await encode(base64url, input));
  });

  test("1 MiB を不揃い分割しても encode できる", async ({ expect }) => {
    // 準備：
    const base64url = new Base64Url();
    const input = new Uint8Array(1024 * 1024);

    for (let index = 0; index < input.length; index++) {
      input[index] = index % 251;
    }

    const chunks: Uint8Array<ArrayBuffer>[] = [
      input.subarray(0, 13),
      input.subarray(13, 4097),
      input.subarray(4097, input.length - 1),
      input.subarray(input.length - 1),
    ];

    // 実行：
    const result = await pumpEncode(base64url, chunks);

    // 検証：
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(concatBytes(result.outputChunks)).toStrictEqual(await encode(base64url, input));
  });

  test("3 の倍数長では flush で追加出力しない", async ({ expect }) => {
    // 準備：
    const base64url = new Base64Url();
    const input = Uint8Array.from([0x66, 0x6f, 0x6f]);

    // 実行：
    const result = await pumpEncode(base64url, [input]);

    // 検証：
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(concatBytes(result.outputChunks)).toStrictEqual(await encode(base64url, input));
  });
});

describe("decodeStream", () => {
  test("複数の値をデコードする", async ({ expect }) => {
    // 準備：
    const base64url = new Base64Url();
    const input = textEncoder.encode("Zm9vYmFy");

    // 実行：
    const result = await pumpDecode(base64url, [input]);

    // 検証：
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(concatBytes(result.outputChunks)).toStrictEqual(
      Uint8Array.from([0x66, 0x6f, 0x6f, 0x62, 0x61, 0x72]),
    );
  });

  test("1 バイトずつ分割してもデコードできる", async ({ expect }) => {
    // 準備：
    const base64url = new Base64Url();
    const input = Uint8Array.from([0x66, 0x6f, 0x6f, 0x62, 0x61, 0x72]);
    const encoded = await encode(base64url, input);

    // 実行：
    const result = await pumpDecode(base64url, splitIntoChunks(encoded, 1));

    // 検証：
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(concatBytes(result.outputChunks)).toStrictEqual(input);
  });

  test("不揃いな境界で分割してもデコードできる", async ({ expect }) => {
    // 準備：
    const base64url = new Base64Url();
    const input = Uint8Array.from([0x66, 0x6f, 0x6f, 0x62, 0x61, 0x72, 0x00, 0xff]);
    const encoded = await encode(base64url, input);

    // 実行と検証：
    for (const size of [1, 2, 3, 5, 7, 13, 64]) {
      const result = await pumpDecode(base64url, splitIntoChunks(encoded, size));
      expect(result.writeError, `size=${size}`).toBeUndefined();
      expect(result.readError, `size=${size}`).toBeUndefined();
      expect(concatBytes(result.outputChunks), `size=${size}`).toStrictEqual(input);
    }
  });

  test("= ラン内分割をまたいでデコードできる", async ({ expect }) => {
    // 準備：
    const base64url = new Base64Url();
    const expected = Uint8Array.from([0x66]);

    // 実行：
    const first = await pumpDecode(base64url, [textEncoder.encode("Zg="), textEncoder.encode("=")]);
    const second = await pumpDecode(base64url, [
      textEncoder.encode("Z"),
      textEncoder.encode("g=="),
    ]);
    const third = await pumpDecode(base64url, [textEncoder.encode("Zg"), textEncoder.encode("==")]);
    const fourth = await pumpDecode(base64url, [
      textEncoder.encode("Zm8"),
      textEncoder.encode("="),
    ]);

    // 検証：
    expect(first.writeError).toBeUndefined();
    expect(first.readError).toBeUndefined();
    expect(concatBytes(first.outputChunks)).toStrictEqual(expected);
    expect(second.writeError).toBeUndefined();
    expect(second.readError).toBeUndefined();
    expect(concatBytes(second.outputChunks)).toStrictEqual(expected);
    expect(third.writeError).toBeUndefined();
    expect(third.readError).toBeUndefined();
    expect(concatBytes(third.outputChunks)).toStrictEqual(expected);
    expect(fourth.writeError).toBeUndefined();
    expect(fourth.readError).toBeUndefined();
    expect(concatBytes(fourth.outputChunks)).toStrictEqual(Uint8Array.from([0x66, 0x6f]));
  });

  test("単チャンクの付与形は空 enqueue なしでデコードできる", async ({ expect }) => {
    // 準備：
    const base64url = new Base64Url();

    // 実行：
    const result = await pumpDecode(base64url, [textEncoder.encode("Zg==")]);
    const long = await pumpDecode(base64url, [textEncoder.encode("Zm9vYmE=")]);

    // 検証：
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(concatBytes(result.outputChunks)).toStrictEqual(Uint8Array.from([0x66]));

    for (const chunk of result.outputChunks) {
      expect(chunk.byteLength).toBeGreaterThan(0);
    }

    expect(long.writeError).toBeUndefined();
    expect(long.readError).toBeUndefined();
    expect(concatBytes(long.outputChunks)).toStrictEqual(
      Uint8Array.from([0x66, 0x6f, 0x6f, 0x62, 0x61]),
    );
  });

  test("付与形と省略形の混在をデコードできる", async ({ expect }) => {
    // 準備：
    const base64url = new Base64Url();
    const input = Uint8Array.from([0x66, 0x6f, 0x6f, 0x62, 0x61, 0x72]);
    const padded = await encode(new Base64Url({ padding: true }), input);

    // 実行：
    const result = await pumpDecode(base64url, splitIntoChunks(padded, 2));

    // 検証：
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(concatBytes(result.outputChunks)).toStrictEqual(input);
  });

  test("空のストリームは値を出力しない", async ({ expect }) => {
    // 準備：
    const base64url = new Base64Url();

    // 実行：
    const empty = await pumpDecode(base64url, []);
    const zeroBytes = await pumpDecode(base64url, [new Uint8Array(0)]);

    // 検証：
    expect(empty.writeError).toBeUndefined();
    expect(empty.readError).toBeUndefined();
    expect(empty.outputChunks).toStrictEqual([]);
    expect(zeroBytes.writeError).toBeUndefined();
    expect(zeroBytes.readError).toBeUndefined();
    expect(zeroBytes.outputChunks).toStrictEqual([]);
  });

  test("末尾に 1 文字だけ残るストリームは Base64UrlDecodeError で失敗する", async ({ expect }) => {
    // 準備：
    const base64url = new Base64Url();

    // 実行：
    const result = await pumpDecode(base64url, [textEncoder.encode("a")]);

    // 検証：
    expect(streamError(result)).toBeInstanceOf(Base64UrlDecodeError);
  });

  test("不正文字を含むストリームは Base64UrlDecodeError で失敗する", async ({ expect }) => {
    // 準備：
    const base64url = new Base64Url();

    // 実行：
    const first = await pumpDecode(base64url, [textEncoder.encode("ab+c")]);
    const second = await pumpDecode(base64url, [textEncoder.encode("ab=c")]);

    // 検証：
    expect(streamError(first)).toBeInstanceOf(Base64UrlDecodeError);
    expect(streamError(second)).toBeInstanceOf(Base64UrlDecodeError);
  });

  test("= の後に追加データが来ると Base64UrlDecodeError で失敗する", async ({ expect }) => {
    // 準備：
    const base64url = new Base64Url();

    // 実行：
    const first = await pumpDecode(base64url, [
      textEncoder.encode("Zg=="),
      textEncoder.encode("Zg"),
    ]);
    const second = await pumpDecode(base64url, [
      textEncoder.encode("Zg=="),
      textEncoder.encode("="),
    ]);
    const third = await pumpDecode(base64url, [textEncoder.encode("Zm8==")]);

    // 検証：
    expect(streamError(first)).toBeInstanceOf(Base64UrlDecodeError);
    expect(streamError(second)).toBeInstanceOf(Base64UrlDecodeError);
    expect(streamError(third)).toBeInstanceOf(Base64UrlDecodeError);
  });

  test("不正な UTF-8 を流すと TypeError で失敗する", async ({ expect }) => {
    // 準備：
    const base64url = new Base64Url();
    const invalid = Uint8Array.from([0x31, 0x0a, 0xff, 0x0a]);

    // 実行：
    const result = await pumpDecode(base64url, [invalid]);

    // 検証：
    expect(streamError(result)).toBeInstanceOf(TypeError);
  });

  test("前半だけで終わるストリームは TypeError で失敗する", async ({ expect }) => {
    // 準備：
    const base64url = new Base64Url();
    const truncated = Uint8Array.from([0xe3]);

    // 実行：
    const result = await pumpDecode(base64url, [truncated]);

    // 検証：
    expect(streamError(result)).toBeInstanceOf(TypeError);
    expect(streamError(result)).not.toBeInstanceOf(Base64UrlDecodeError);
  });

  test("BOM 単体は空成功する", async ({ expect }) => {
    // 準備：
    const base64url = new Base64Url();
    const bom = Uint8Array.from([0xef, 0xbb, 0xbf]);

    // 実行：
    const result = await pumpDecode(base64url, [bom]);

    // 検証：
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(result.outputChunks).toStrictEqual([]);
  });

  test("大きな値をチャンク境界をまたいでデコードできる", async ({ expect }) => {
    // 準備：
    const base64url = new Base64Url();
    const input = new Uint8Array(256 * 1024);

    for (let index = 0; index < input.length; index++) {
      input[index] = index % 251;
    }

    const encoded = await encode(base64url, input);

    // 実行：
    const result = await pumpDecode(base64url, splitIntoChunks(encoded, 7));

    // 検証：
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(concatBytes(result.outputChunks)).toStrictEqual(input);
  });
});

describe("ストリームの往復", () => {
  test("encodeStream と decodeStream を往復すると元の値に戻る", async ({ expect }) => {
    // 準備：
    const base64url = new Base64Url();
    const chunks: Uint8Array<ArrayBuffer>[] = [
      Uint8Array.from([0x66, 0x6f]),
      Uint8Array.from([0x6f, 0x62, 0x61]),
      Uint8Array.from([0xff]),
    ];

    // 実行：
    const decoded = await roundTripStream(base64url, chunks);

    // 検証：
    expect(concatBytes(decoded)).toStrictEqual(concatBytes(chunks));
  });

  test("出力チャンクの連結を一括 decode すると元の値に戻る", async ({ expect }) => {
    // 準備：
    const base64url = new Base64Url();
    const input = Uint8Array.from([0x66, 0x6f, 0x6f, 0x62, 0x61, 0x72, 0x00, 0xff]);

    // 実行：
    const encoded = await pumpEncode(base64url, [input]);
    const decoded = await decode(base64url, concatBytes(encoded.outputChunks));

    // 検証：
    expect(encoded.writeError).toBeUndefined();
    expect(encoded.readError).toBeUndefined();
    expect(decoded).toStrictEqual(input);
  });

  test("一括 encode した結果を小さなチャンクで decode できる", async ({ expect }) => {
    // 準備：
    const base64url = new Base64Url();
    const input = Uint8Array.from([0x66, 0x6f, 0x6f, 0x62, 0x61, 0x72, 0x00]);

    // 実行：
    const encoded = await encode(base64url, input);
    const result = await pumpDecode(base64url, splitIntoChunks(encoded, 3));

    // 検証：
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(concatBytes(result.outputChunks)).toStrictEqual(input);
  });
});
