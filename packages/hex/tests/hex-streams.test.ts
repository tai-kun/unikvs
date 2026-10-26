// oxlint-disable unicorn/number-literal-case
import type { IMiddleware } from "@unikvs/core";
import {
  readAll,
  bytesEqual,
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

import { HexDecodeError } from "../src/errors.js";
import Hex from "../src/hex.js";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

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
 * バイト列をエンコードして返します。
 */
async function encode(
  target: Hex,
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
 * チャンク列をエンコードストリームに流し、出力されたチャンクを返します。
 */
function pumpEncode(
  target: Hex,
  chunks: readonly Uint8Array<ArrayBuffer>[],
): Promise<{
  readError: unknown;
  writeError: undefined;
  outputChunks: Uint8Array<ArrayBuffer>[];
}> {
  const c = createEncodeStreamContext(sourceFrom(chunks));

  return target
    .encodeStream(
      c as IMiddleware.EncodeStreamContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
      createNext(),
    )
    .then(() => collectSettled(c.destination as ReadableStream<Uint8Array<ArrayBuffer>>));
}

/**
 * チャンク列をデコードストリームに流し、出力されたチャンクを返します。
 */
function pumpDecode(
  target: Hex,
  chunks: readonly Uint8Array<ArrayBuffer>[],
): Promise<{
  readError: unknown;
  writeError: undefined;
  outputChunks: Uint8Array<ArrayBuffer>[];
}> {
  const c = createDecodeStreamContext(sourceFrom(chunks));

  return target
    .decodeStream(
      c as IMiddleware.DecodeStreamContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
      createNext(),
    )
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

describe("encodeStream", () => {
  test("各チャンクを独立に hex 化する", async ({ expect }) => {
    // 準備：
    const hex = new Hex();
    const chunks: Uint8Array<ArrayBuffer>[] = [
      Uint8Array.from([0xde, 0xad]),
      Uint8Array.from([0xbe, 0xef]),
      Uint8Array.from([0x00, 0xff]),
    ];

    // 実行：
    const result = await pumpEncode(hex, chunks);
    const expected = await encode(hex, concatBytes(chunks));

    // 検証：
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(concatBytes(result.outputChunks)).toStrictEqual(expected);
  });

  test("空のストリームは空の出力になる", async ({ expect }) => {
    // 準備：
    const hex = new Hex();

    // 実行：
    const result = await pumpEncode(hex, []);

    // 検証：
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(result.outputChunks).toStrictEqual([]);
  });

  test("空チャンクは無視される", async ({ expect }) => {
    // 準備：
    const hex = new Hex();
    const chunks: Uint8Array<ArrayBuffer>[] = [
      new Uint8Array(0),
      Uint8Array.from([0xde, 0xad]),
      new Uint8Array(0),
    ];

    // 実行：
    const result = await pumpEncode(hex, chunks);

    // 検証：
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(textDecoder.decode(concatBytes(result.outputChunks))).toBe("dead");
  });

  test("1 MiB を不揃い分割しても encode できる", async ({ expect }) => {
    // 準備：
    const hex = new Hex();
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
    const result = await pumpEncode(hex, chunks);

    // 検証：
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    // 数 MiB のデータを toStrictEqual で比較すると遅いため bytesEqual を使います。
    expect(bytesEqual(concatBytes(result.outputChunks), await encode(hex, input))).toBe(true);
  });
});

describe("decodeStream", () => {
  test("複数の値をデコードする", async ({ expect }) => {
    // 準備：
    const hex = new Hex();
    const input = textEncoder.encode("deadbeef00ff");

    // 実行：
    const result = await pumpDecode(hex, [input]);

    // 検証：
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(concatBytes(result.outputChunks)).toStrictEqual(
      Uint8Array.from([0xde, 0xad, 0xbe, 0xef, 0x00, 0xff]),
    );
  });

  test("1 バイトずつ分割してもデコードできる", async ({ expect }) => {
    // 準備：
    const hex = new Hex();
    const input = Uint8Array.from([0xde, 0xad, 0xbe, 0xef, 0x01, 0x23]);
    const encoded = await encode(hex, input);

    // 実行：
    const result = await pumpDecode(hex, splitIntoChunks(encoded, 1));

    // 検証：
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(concatBytes(result.outputChunks)).toStrictEqual(input);
  });

  test("不揃いな境界で分割してもデコードできる", async ({ expect }) => {
    // 準備：
    const hex = new Hex();
    const input = Uint8Array.from([0xde, 0xad, 0xbe, 0xef, 0x01, 0x23, 0x45, 0x67]);
    const encoded = await encode(hex, input);

    // 実行と検証：
    for (const size of [1, 2, 3, 5, 7, 13, 64]) {
      const result = await pumpDecode(hex, splitIntoChunks(encoded, size));
      expect(result.writeError, `size=${size}`).toBeUndefined();
      expect(result.readError, `size=${size}`).toBeUndefined();
      expect(concatBytes(result.outputChunks), `size=${size}`).toStrictEqual(input);
    }
  });

  test("奇数分割をまたいでデコードできる", async ({ expect }) => {
    // 準備：
    const hex = new Hex();
    const input = Uint8Array.from([0xde, 0xad, 0xbe, 0xef]);
    const encoded = await encode(hex, input);

    // 実行：
    const shifted = await pumpDecode(hex, [
      encoded.subarray(0, 1),
      encoded.subarray(1, 3),
      encoded.subarray(3),
    ]);
    const random = await pumpDecode(hex, [
      encoded.subarray(0, 3),
      encoded.subarray(3, 4),
      encoded.subarray(4),
    ]);

    // 検証：
    expect(shifted.writeError).toBeUndefined();
    expect(shifted.readError).toBeUndefined();
    expect(concatBytes(shifted.outputChunks)).toStrictEqual(input);
    expect(random.writeError).toBeUndefined();
    expect(random.readError).toBeUndefined();
    expect(concatBytes(random.outputChunks)).toStrictEqual(input);
  });

  test("大文字と混在をチャンク分割してもデコードできる", async ({ expect }) => {
    // 準備：
    const hex = new Hex();
    const expected = Uint8Array.from([0xde, 0xad, 0xbe, 0xef]);

    // 実行：
    const upper = await pumpDecode(hex, splitIntoChunks(textEncoder.encode("DEADBEEF"), 3));
    const mixed = await pumpDecode(hex, splitIntoChunks(textEncoder.encode("DeAdBeEf"), 1));

    // 検証：
    expect(upper.writeError).toBeUndefined();
    expect(upper.readError).toBeUndefined();
    expect(concatBytes(upper.outputChunks)).toStrictEqual(expected);
    expect(mixed.writeError).toBeUndefined();
    expect(mixed.readError).toBeUndefined();
    expect(concatBytes(mixed.outputChunks)).toStrictEqual(expected);
  });

  test("空のストリームは値を出力しない", async ({ expect }) => {
    // 準備：
    const hex = new Hex();

    // 実行：
    const empty = await pumpDecode(hex, []);
    const zeroBytes = await pumpDecode(hex, [new Uint8Array(0)]);

    // 検証：
    expect(empty.writeError).toBeUndefined();
    expect(empty.readError).toBeUndefined();
    expect(empty.outputChunks).toStrictEqual([]);
    expect(zeroBytes.writeError).toBeUndefined();
    expect(zeroBytes.readError).toBeUndefined();
    expect(zeroBytes.outputChunks).toStrictEqual([]);
  });

  test("奇数長で終わるストリームは HexDecodeError で失敗する", async ({ expect }) => {
    // 準備：
    const hex = new Hex();

    // 実行：
    const result = await pumpDecode(hex, [textEncoder.encode("abc")]);

    // 検証：
    expect(streamError(result)).toBeInstanceOf(HexDecodeError);
  });

  test("不正文字を含むストリームは HexDecodeError で失敗する", async ({ expect }) => {
    // 準備：
    const hex = new Hex();

    // 実行：
    const result = await pumpDecode(hex, [textEncoder.encode("zz")]);

    // 検証：
    expect(streamError(result)).toBeInstanceOf(HexDecodeError);
  });

  test("不正な UTF-8 を流すと TypeError で失敗する", async ({ expect }) => {
    // 準備：
    const hex = new Hex();
    const invalid = Uint8Array.from([0x31, 0x0a, 0xff, 0x0a]);

    // 実行：
    const result = await pumpDecode(hex, [invalid]);

    // 検証：
    expect(streamError(result)).toBeInstanceOf(TypeError);
  });

  test("前半だけで終わるストリームは TypeError で失敗する", async ({ expect }) => {
    // 準備：
    const hex = new Hex();
    const truncated = Uint8Array.from([0xe3]);

    // 実行：
    const result = await pumpDecode(hex, [truncated]);

    // 検証：
    expect(streamError(result)).toBeInstanceOf(TypeError);
    expect(streamError(result)).not.toBeInstanceOf(HexDecodeError);
  });

  test("大きな値をチャンク境界をまたいでデコードできる", async ({ expect }) => {
    // 準備：
    const hex = new Hex();
    const input = new Uint8Array(256 * 1024);

    for (let index = 0; index < input.length; index++) {
      input[index] = index % 251;
    }

    const encoded = await encode(hex, input);

    // 実行：
    const result = await pumpDecode(hex, splitIntoChunks(encoded, 7));

    // 検証：
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    // 数百 KiB のデータを toStrictEqual で比較すると遅いため bytesEqual を使います。
    expect(bytesEqual(concatBytes(result.outputChunks), input)).toBe(true);
  });
});

describe("ストリームの往復", () => {
  test("encodeStream と decodeStream を往復すると元の値に戻る", async ({ expect }) => {
    // 準備：
    const hex = new Hex();
    const chunks: Uint8Array<ArrayBuffer>[] = [
      Uint8Array.from([0xde, 0xad, 0xbe, 0xef]),
      Uint8Array.from([0x00, 0x01, 0x02]),
      Uint8Array.from([0xff]),
    ];

    // 実行：
    const encodedContext = createEncodeStreamContext(sourceFrom(chunks));
    await hex.encodeStream(
      encodedContext as IMiddleware.EncodeStreamContext<
        Uint8Array<ArrayBuffer>,
        Uint8Array<ArrayBuffer>
      >,
      createNext(),
    );

    const decodedContext = createDecodeStreamContext(
      encodedContext.destination as ReadableStream<Uint8Array<ArrayBuffer>>,
    );
    await hex.decodeStream(
      decodedContext as IMiddleware.DecodeStreamContext<
        Uint8Array<ArrayBuffer>,
        Uint8Array<ArrayBuffer>
      >,
      createNext(),
    );

    const decoded = await readAll(
      decodedContext.destination as ReadableStream<Uint8Array<ArrayBuffer>>,
    );

    // 検証：
    expect(concatBytes(decoded)).toStrictEqual(concatBytes(chunks));
  });

  test("出力チャンクの連結を一括 decode すると元の値に戻る", async ({ expect }) => {
    // 準備：
    const hex = new Hex();
    const input = Uint8Array.from([0xde, 0xad, 0xbe, 0xef, 0x00, 0xff]);

    // 実行：
    const encoded = await pumpEncode(hex, [input]);
    const decodeContext = createDecodeContext(concatBytes(encoded.outputChunks));
    await hex.decode(
      decodeContext as IMiddleware.DecodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
      createNext(),
    );

    // 検証：
    expect(encoded.writeError).toBeUndefined();
    expect(encoded.readError).toBeUndefined();
    expect(decodeContext.destination).toStrictEqual(input);
  });

  test("一括 encode した結果を小さなチャンクで decode できる", async ({ expect }) => {
    // 準備：
    const hex = new Hex();
    const input = Uint8Array.from([0xde, 0xad, 0xbe, 0xef, 0x01, 0x23, 0x45]);

    // 実行：
    const encoded = await encode(hex, input);
    const result = await pumpDecode(hex, splitIntoChunks(encoded, 3));

    // 検証：
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(concatBytes(result.outputChunks)).toStrictEqual(input);
  });
});
