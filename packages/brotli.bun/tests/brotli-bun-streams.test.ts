import type { IMiddleware } from "@unikvs/core";
import {
  readAll,
  createNext,
  sourceFrom,
  concatBytes,
  createOpenContext,
  createPseudoRandomBytes,
  createDecodeStreamContext,
  createEncodeStreamContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import BrotliBun from "../src/brotli-bun.js";

type ByteEncodeStream = IMiddleware.EncodeStreamContext<
  Uint8Array<ArrayBuffer>,
  Uint8Array<ArrayBuffer>
>;

type ByteDecodeStream = IMiddleware.DecodeStreamContext<
  Uint8Array<ArrayBuffer>,
  Uint8Array<ArrayBuffer>
>;

/**
 * ターゲットを開きます。
 */
async function openTarget(target: BrotliBun, signal: AbortSignal): Promise<void> {
  await target.open(createOpenContext({ signal }) as IMiddleware.OpenContext);
}

/**
 * チャンク列を圧縮ストリームに流し、出力チャンクを結合して返します。
 */
async function pumpEncode(
  target: BrotliBun,
  chunks: readonly Uint8Array<ArrayBuffer>[],
): Promise<Uint8Array<ArrayBuffer>> {
  const c = createEncodeStreamContext(sourceFrom(chunks));
  await target.encodeStream(c as ByteEncodeStream, createNext());

  return concatBytes(await readAll(c.destination as ReadableStream<Uint8Array<ArrayBuffer>>));
}

/**
 * チャンク列を展開ストリームに流し、出力チャンクを結合して返します。
 */
async function pumpDecode(
  target: BrotliBun,
  chunks: readonly Uint8Array<ArrayBuffer>[],
): Promise<Uint8Array<ArrayBuffer>> {
  const c = createDecodeStreamContext(sourceFrom(chunks));
  await target.decodeStream(c as ByteDecodeStream, createNext());

  return concatBytes(await readAll(c.destination as ReadableStream<Uint8Array<ArrayBuffer>>));
}

/**
 * バイト列を指定幅で分割します。
 */
function splitIntoChunks(data: Uint8Array<ArrayBuffer>, width: number): Uint8Array<ArrayBuffer>[] {
  const chunks: Uint8Array<ArrayBuffer>[] = [];

  for (let offset = 0; offset < data.byteLength; offset += width) {
    chunks.push(data.slice(offset, offset + width));
  }

  return chunks;
}

describe("ストリーム API の提供", () => {
  test("encodeStream と decodeStream を持つ", ({ expect }) => {
    // 準備：
    const target = new BrotliBun();

    // 実行と検証：
    expect(typeof target.encodeStream).toBe("function");
    expect(typeof target.decodeStream).toBe("function");
  });

  test("open 前に呼ぶと TypeError で拒否される", async ({ expect }) => {
    // 準備：
    // 実装は open() で解決した実行環境を必須とするため、未 open の使用は TypeError になる。
    const target = new BrotliBun();
    const input = [new Uint8Array([1])];

    // 実行と検証：
    const encodeContext = createEncodeStreamContext(sourceFrom(input));
    await expect(
      target.encodeStream(encodeContext as ByteEncodeStream, createNext()),
    ).rejects.toThrow(TypeError);

    const decodeContext = createDecodeStreamContext(sourceFrom(input));
    await expect(
      target.decodeStream(decodeContext as ByteDecodeStream, createNext()),
    ).rejects.toThrow(TypeError);
  });

  describe("ミドルウェア連鎖", () => {
    test("encodeStream と decodeStream は変換結果を設定してから next を1回呼ぶ", async ({
      expect,
      signal,
    }) => {
      // 準備：
      const target = new BrotliBun();
      await openTarget(target, signal);

      const input = createPseudoRandomBytes(128, 61);
      const encodeContext = createEncodeStreamContext(sourceFrom([input]));
      let encodeNextCalls = 0;
      let encodedAtNext: ReadableStream<Uint8Array<ArrayBuffer>> | undefined;

      // 実行：
      await target.encodeStream(encodeContext as ByteEncodeStream, (): Promise<void> => {
        encodeNextCalls += 1;
        encodedAtNext = encodeContext.destination;

        return Promise.resolve();
      });

      // 検証：
      expect(encodeNextCalls).toBe(1);
      expect(encodedAtNext).toBeInstanceOf(ReadableStream);

      // 準備：
      const encoded = concatBytes(
        await readAll(encodeContext.destination as ReadableStream<Uint8Array<ArrayBuffer>>),
      );
      const decodeContext = createDecodeStreamContext(sourceFrom([encoded]));
      let decodeNextCalls = 0;
      let decodedAtNext: ReadableStream<Uint8Array<ArrayBuffer>> | undefined;

      // 実行：
      await target.decodeStream(decodeContext as ByteDecodeStream, (): Promise<void> => {
        decodeNextCalls += 1;
        decodedAtNext = decodeContext.destination;

        return Promise.resolve();
      });

      // 検証：
      expect(decodeNextCalls).toBe(1);
      expect(decodedAtNext).toBeInstanceOf(ReadableStream);
      expect(
        concatBytes(
          await readAll(decodeContext.destination as ReadableStream<Uint8Array<ArrayBuffer>>),
        ),
      ).toStrictEqual(input);
    });
  });

  test("分割書き込みしてもストリームで往復できる", async ({ expect, signal }) => {
    // 準備：
    const target = new BrotliBun();
    await openTarget(target, signal);

    const input = createPseudoRandomBytes(4096, 35);

    // 実行：
    const encoded = await pumpEncode(target, splitIntoChunks(input, 7));
    const decoded = await pumpDecode(target, splitIntoChunks(encoded, 5));

    // 検証：
    expect(decoded).toStrictEqual(input);
  });

  test("単一チャンクでもストリームで往復できる", async ({ expect, signal }) => {
    // 準備：
    const target = new BrotliBun();
    await openTarget(target, signal);

    const input = createPseudoRandomBytes(1024, 39);

    // 実行：
    const decoded = await pumpDecode(target, [await pumpEncode(target, [input])]);

    // 検証：
    expect(decoded).toStrictEqual(input);
  });

  test("空のストリームを流すと空出力に戻る", async ({ expect, signal }) => {
    // 準備：
    const target = new BrotliBun();
    await openTarget(target, signal);

    // 実行：
    const decoded = await pumpDecode(target, [await pumpEncode(target, [])]);

    // 検証：
    expect(decoded).toStrictEqual(new Uint8Array(0));
  });

  test("Buffer を書き込んでもストリームで往復できる", async ({ expect, signal }) => {
    // 準備：
    // Buffer は Uint8Array の一種としてそのまま扱えることを検証する。
    const target = new BrotliBun();
    await openTarget(target, signal);

    const input = createPseudoRandomBytes(1024, 38);
    const bufferChunks = splitIntoChunks(input, 13).map(
      (chunk) =>
        Buffer.from(
          chunk.buffer,
          chunk.byteOffset,
          chunk.byteLength,
        ) as unknown as Uint8Array<ArrayBuffer>,
    );

    // 実行：
    const encoded = await pumpEncode(target, bufferChunks);
    const encodedBufferChunks = splitIntoChunks(encoded, 7).map(
      (chunk) =>
        Buffer.from(
          chunk.buffer,
          chunk.byteOffset,
          chunk.byteLength,
        ) as unknown as Uint8Array<ArrayBuffer>,
    );
    const decoded = await pumpDecode(target, encodedBufferChunks);

    // 検証：
    expect(decoded).toStrictEqual(input);
  });

  test("encodeStream の出力チャンクは所有化されている", async ({ expect, signal }) => {
    // 準備：
    const target = new BrotliBun();
    await openTarget(target, signal);

    const input = createPseudoRandomBytes(256, 36);
    const c = createEncodeStreamContext(sourceFrom([input]));
    await target.encodeStream(c as ByteEncodeStream, createNext());

    // 実行：
    const outputs = await readAll(c.destination as ReadableStream<Uint8Array<ArrayBuffer>>);

    // 検証：
    expect(outputs.length).toBeGreaterThan(0);

    for (const output of outputs) {
      expect(output.buffer).toBeInstanceOf(ArrayBuffer);
      expect(output.byteOffset).toBe(0);
      expect(output.byteLength).toBe(output.buffer.byteLength);
    }
  });

  test("decodeStream の出力チャンクは所有化されている", async ({ expect, signal }) => {
    // 準備：
    const target = new BrotliBun();
    await openTarget(target, signal);

    const input = createPseudoRandomBytes(256, 37);
    const encoded = await pumpEncode(target, [input]);
    const c = createDecodeStreamContext(sourceFrom([encoded]));
    await target.decodeStream(c as ByteDecodeStream, createNext());

    // 実行：
    const outputs = await readAll(c.destination as ReadableStream<Uint8Array<ArrayBuffer>>);

    // 検証：
    expect(outputs.length).toBeGreaterThan(0);

    for (const output of outputs) {
      expect(output.buffer).toBeInstanceOf(ArrayBuffer);
      expect(output.byteOffset).toBe(0);
      expect(output.byteLength).toBe(output.buffer.byteLength);
    }

    expect(concatBytes(outputs)).toStrictEqual(input);
  });

  test("1 MiB を細切れに書き込んでもストリームで往復できる", async ({ expect, signal }) => {
    // 準備：
    const target = new BrotliBun();
    await openTarget(target, signal);

    const input = createPseudoRandomBytes(1024 * 1024, 40);

    // 実行：
    const encoded = await pumpEncode(target, splitIntoChunks(input, 8192));
    const decoded = await pumpDecode(target, splitIntoChunks(encoded, 1024));

    // 検証：
    expect(decoded).toStrictEqual(input);
  }, 30_000);

  test("異なるレベルのストリーム出力は互いに展開できる", async ({ expect, signal }) => {
    // 準備：
    const low = new BrotliBun({ level: 0 });
    const high = new BrotliBun({ level: 11 });
    await openTarget(low, signal);
    await openTarget(high, signal);

    const input = createPseudoRandomBytes(2048, 41);

    // 実行：
    const decodedLow = await pumpDecode(high, [await pumpEncode(low, [input])]);
    const decodedHigh = await pumpDecode(low, [await pumpEncode(high, [input])]);

    // 検証：
    expect(decodedLow).toStrictEqual(input);
    expect(decodedHigh).toStrictEqual(input);
  });

  test("level が高いほどストリームの圧縮結果が小さくなる", async ({ expect, signal }) => {
    // 準備：
    const input = new TextEncoder().encode(
      "Repeat this text multiple times to ensure compression efficiency. ".repeat(100),
    );
    const low = new BrotliBun({ level: 0 });
    const high = new BrotliBun({ level: 11 });
    await openTarget(low, signal);
    await openTarget(high, signal);

    // 実行：
    const lowEncoded = await pumpEncode(low, [input]);
    const highEncoded = await pumpEncode(high, [input]);

    // 検証：
    expect(highEncoded.byteLength).toBeLessThan(lowEncoded.byteLength);
  });

  test("壊れたデータを流すと decodeStream 側の読み取りで拒否される", async ({ expect, signal }) => {
    // 準備：
    const target = new BrotliBun();
    await openTarget(target, signal);

    const garbage = createPseudoRandomBytes(64, 42);
    const c = createDecodeStreamContext(sourceFrom([garbage]));

    // 実行：
    await target.decodeStream(c as ByteDecodeStream, createNext());

    const reading = readAll(c.destination as ReadableStream<Uint8Array<ArrayBuffer>>);

    // 検証：
    // 実装は変換の設定時ではなく読み取り時に上流エラーをそのまま伝搬するため、汎用エラーを検証する。
    await expect(reading).rejects.toThrow(Error);
  });
});
