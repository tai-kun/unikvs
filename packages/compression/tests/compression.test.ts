import type { IMiddleware } from "@unikvs/core";
import {
  createNext,
  sourceFrom,
  createDecodeContext,
  createEncodeContext,
  createDecodeStreamContext,
  createEncodeStreamContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import Compression from "../src/compression.js";

const FORMATS = ["gzip", "deflate", "deflate-raw"] as const;

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
 * 疑似乱数ジェネレーター (線形合同法) で、実行ごとに同じバイト列を生成します。
 */
function createPseudoRandomBytes(size: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size);
  let state = 0x12_34_56_78;

  for (let i = 0; i < size; i++) {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    bytes[i] = state >>> 24;
  }

  return bytes;
}

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
 * ストリームからすべてのチャンクを読み取ります。
 */
async function readAll(
  stream: ReadableStream<Uint8Array<ArrayBuffer>>,
): Promise<Uint8Array<ArrayBuffer>[]> {
  const reader = stream.getReader();
  const outputChunks: Uint8Array<ArrayBuffer>[] = [];

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    outputChunks.push(value);
  }

  return outputChunks;
}

/**
 * 複数のチャンクを 1 つのバイト配列に連結します。
 */
function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

/**
 * チャンク列を圧縮ストリームに流し、出力ストリームを返します。
 */
async function encodeStream(
  compression: Compression,
  chunks: readonly Uint8Array<ArrayBuffer>[],
): Promise<ReadableStream<Uint8Array<ArrayBuffer>>> {
  const c = createEncodeStreamContext(sourceFrom(chunks));
  await compression.encodeStream(c as ByteEncodeStreamContext, createNext());

  return c.destination;
}

/**
 * チャンク列を展開ストリームに流し、出力ストリームを返します。
 */
async function decodeStream(
  compression: Compression,
  chunks: readonly Uint8Array<ArrayBuffer>[],
): Promise<ReadableStream<Uint8Array<ArrayBuffer>>> {
  const c = createDecodeStreamContext(sourceFrom(chunks));
  await compression.decodeStream(c as ByteDecodeStreamContext, createNext());

  return c.destination;
}

describe("初期化と基本属性", () => {
  test("name プロパティは Compression を返す", ({ expect }) => {
    // 準備：
    const compression = new Compression("gzip");

    // 実行と検証：
    expect(compression.name).toBe("Compression");
  });

  test("isOpen プロパティは常に true を返す", ({ expect }) => {
    // 準備：
    const compression = new Compression("gzip");

    // 実行と検証：
    expect(compression.isOpen).toBe(true);
  });
});

describe("圧縮と展開のラウンドトリップ", () => {
  test("反復的なテキストを各形式で圧縮して展開すると元のデータに戻る", async ({ expect }) => {
    // 準備：
    const input = new TextEncoder().encode(
      "Repeat this text multiple times to ensure compression efficiency. ".repeat(100),
    );

    // 実行と検証：
    for (const format of FORMATS) {
      const compression = new Compression(format);
      const encoded = await encode(compression, input);
      const decoded = await decode(compression, encoded);
      expect(decoded, `format=${format}`).toStrictEqual(input);
    }
  });

  test("空のデータを各形式で圧縮して展開すると空のデータに戻る", async ({ expect }) => {
    // 準備：
    const input = new Uint8Array(0);

    // 実行と検証：
    for (const format of FORMATS) {
      const compression = new Compression(format);
      const encoded = await encode(compression, input);
      const decoded = await decode(compression, encoded);
      expect(decoded, `format=${format}`).toStrictEqual(input);
    }
  });

  test("圧縮が意味しないランダムなデータでも gzip のラウンドトリップで元のデータに戻る", async ({
    expect,
  }) => {
    // 準備：
    const compression = new Compression("gzip");
    const input = createPseudoRandomBytes(64 * 1024);

    // 実行：
    const encoded = await encode(compression, input);
    const decoded = await decode(compression, encoded);

    // 検証：
    expect(decoded).toStrictEqual(input);
  });

  test("1 MiB のデータを gzip でラウンドトリップしても元のデータに戻る", async ({ expect }) => {
    // 準備：
    const compression = new Compression("gzip");
    const input = createPseudoRandomBytes(1024 * 1024);

    // 実行：
    const encoded = await encode(compression, input);
    const decoded = await decode(compression, encoded);

    // 検証：
    expect(decoded).toStrictEqual(input);
  });
});

describe("圧縮の効果", () => {
  test("反復的なテキストは gzip で圧縮後に入力より小さくなる", async ({ expect }) => {
    // 準備：
    const compression = new Compression("gzip");
    const input = new TextEncoder().encode(
      "Repeat this text multiple times to ensure compression efficiency. ".repeat(100),
    );

    // 実行：
    const encoded = await encode(compression, input);

    // 検証：
    expect(encoded.length).toBeLessThan(input.length);
  });
});

describe("ストリームによる変換", () => {
  test("encodeStream の出力は CompressionStream を経由した ReadableStream である", async ({
    expect,
  }) => {
    // 準備：
    const compression = new Compression("gzip");

    // 実行：
    const destination = await encodeStream(compression, [new Uint8Array([1, 2, 3])]);

    // 検証：
    expect(destination).toBeInstanceOf(ReadableStream);
    expect(await readAll(destination)).not.toStrictEqual([]);
  });

  test("decodeStream の出力は DecompressionStream を経由した ReadableStream である", async ({
    expect,
  }) => {
    // 準備：
    const compression = new Compression("gzip");
    const input = new TextEncoder().encode("hello ".repeat(100));
    const encoded = await encode(compression, input);

    // 実行：
    const destination = await decodeStream(compression, [encoded]);

    // 検証：
    expect(destination).toBeInstanceOf(ReadableStream);
    expect(concatBytes(await readAll(destination))).toStrictEqual(input);
  });

  test("大きさが不揃いな複数チャンクをストリームで圧縮して展開すると元のデータに戻る", async ({
    expect,
  }) => {
    // 準備：
    const compression = new Compression("gzip");
    const input = createPseudoRandomBytes(8192);
    const inputChunks = [input.subarray(0, 13), input.subarray(13, 4097), input.subarray(4097)];

    // 実行：
    const encodedStream = await encodeStream(compression, inputChunks);
    const decodedStream = await decodeStream(compression, await readAll(encodedStream));
    const decodedChunks = await readAll(decodedStream);

    // 検証：
    expect(concatBytes(decodedChunks)).toStrictEqual(input);
  });
});

describe("異常系", () => {
  test("圧縮データではないバイト列を decode すると拒否される", async ({ expect }) => {
    // 準備：
    const compression = new Compression("gzip");
    const invalidData = new Uint8Array([0, 1, 2, 3, 4, 5]);

    // 実行と検証：
    await expect(decode(compression, invalidData)).rejects.toThrow(Error);
  });

  test("サポートされていない形式は encodeStream の時点で TypeError を投げる", async ({
    expect,
  }) => {
    // 準備：
    // TypeScript の型定義を無視して無効な値を渡す。
    const invalidFormat = "unknown-format" as never;

    // 実行と検証：
    await expect(
      encodeStream(new Compression(invalidFormat), [new Uint8Array([1])]),
    ).rejects.toThrow(TypeError);
  });
});
