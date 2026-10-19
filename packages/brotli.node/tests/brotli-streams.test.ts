import type { IMiddleware } from "@unikvs/core";
import {
  concatBytes,
  createDecodeStreamContext,
  createEncodeStreamContext,
  createNext,
  createOpenContext,
  createPseudoRandomBytes,
  readAll,
  sourceFrom,
  splitIntoChunks,
} from "@unikvs/testing";
import { describe, test } from "vitest";

import Brotli from "../src/brotli.js";

type ByteEncodeStream = IMiddleware.EncodeStreamContext<
  Uint8Array<ArrayBuffer>,
  Uint8Array<ArrayBuffer>
>;
type ByteDecodeStream = IMiddleware.DecodeStreamContext<
  Uint8Array<ArrayBuffer>,
  Uint8Array<ArrayBuffer>
>;

/**
 * 開済みのターゲットを作成します。
 */
async function createOpenedTarget(signal: AbortSignal): Promise<Brotli> {
  const target = new Brotli();
  await target.open(createOpenContext({ signal }) as IMiddleware.OpenContext);

  return target;
}

/**
 * チャンク列を圧縮ストリームに流し、出力チャンクを結合して返します。
 */
async function pumpEncode(
  target: Brotli,
  chunks: ReadonlyArray<Uint8Array<ArrayBuffer>>,
): Promise<Uint8Array<ArrayBuffer>> {
  const c = createEncodeStreamContext(sourceFrom(chunks));
  await target.encodeStream(c as ByteEncodeStream, createNext());

  return concatBytes(await readAll(c.destination as ReadableStream<Uint8Array<ArrayBuffer>>));
}

/**
 * チャンク列を展開ストリームに流し、出力チャンクを結合して返します。
 */
async function pumpDecode(
  target: Brotli,
  chunks: ReadonlyArray<Uint8Array<ArrayBuffer>>,
): Promise<Uint8Array<ArrayBuffer>> {
  const c = createDecodeStreamContext(sourceFrom(chunks));
  await target.decodeStream(c as ByteDecodeStream, createNext());

  return concatBytes(await readAll(c.destination as ReadableStream<Uint8Array<ArrayBuffer>>));
}

describe("ストリームによる変換", () => {
  test("encodeStream と decodeStream を持つ", ({ expect }) => {
    // 準備
    const target = new Brotli();

    // 実行と検証
    expect(typeof target.encodeStream).toBe("function");
    expect(typeof target.decodeStream).toBe("function");
  });

  test("open 前に呼ぶと TypeError で拒否される", async ({ expect }) => {
    // 準備
    // 実装は open() で解決した実行環境を必須とするため、未 open の使用は TypeError になる。
    const target = new Brotli();
    const input = [new Uint8Array([1])];

    // 実行と検証
    const encodeContext = createEncodeStreamContext(sourceFrom(input));
    await expect(
      target.encodeStream(encodeContext as ByteEncodeStream, createNext()),
    ).rejects.toThrow(TypeError);
    const decodeContext = createDecodeStreamContext(sourceFrom(input));
    await expect(
      target.decodeStream(decodeContext as ByteDecodeStream, createNext()),
    ).rejects.toThrow(TypeError);
  });

  test("分割書き込みしてもストリームで往復できる", async ({ expect, signal }) => {
    // 準備
    const target = await createOpenedTarget(signal);
    const input = createPseudoRandomBytes(4096, 21);

    // 実行
    const encoded = await pumpEncode(target, splitIntoChunks(input, 7));
    const decoded = await pumpDecode(target, splitIntoChunks(encoded, 5));

    // 検証
    expect(decoded).toStrictEqual(input);
  });

  test("大きさが不揃いな複数チャンクをストリームで圧縮して展開すると元のデータに戻る", async ({
    expect,
    signal,
  }) => {
    // 準備
    const target = await createOpenedTarget(signal);
    const input = createPseudoRandomBytes(8192, 22);
    const inputChunks = [input.subarray(0, 13), input.subarray(13, 4097), input.subarray(4097)];

    // 実行
    const encoded = await pumpEncode(target, inputChunks);
    const decoded = await pumpDecode(target, [encoded]);

    // 検証
    expect(decoded).toStrictEqual(input);
  });

  test("Buffer を書き込んでもストリームで往復できる", async ({ expect, signal }) => {
    // 準備
    // Node の Buffer 入力は複写せずそのまま渡す分岐を通る。
    const target = await createOpenedTarget(signal);
    const input = createPseudoRandomBytes(1024, 23);
    const bufferChunks = splitIntoChunks(input, 13).map(
      (chunk) =>
        Buffer.from(
          chunk.buffer,
          chunk.byteOffset,
          chunk.byteLength,
        ) as unknown as Uint8Array<ArrayBuffer>,
    );

    // 実行
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

    // 検証
    expect(decoded).toStrictEqual(input);
  });

  test("ストリームの出力チャンクは所有化されている", async ({ expect, signal }) => {
    // 準備
    const target = await createOpenedTarget(signal);
    const input = createPseudoRandomBytes(256, 24);
    const c = createEncodeStreamContext(sourceFrom([input]));
    await target.encodeStream(c as ByteEncodeStream, createNext());

    // 実行
    const outputs = await readAll(c.destination as ReadableStream<Uint8Array<ArrayBuffer>>);

    // 検証
    expect(outputs.length).toBeGreaterThan(0);

    for (const output of outputs) {
      expect(output.buffer).toBeInstanceOf(ArrayBuffer);
      expect(output.byteOffset).toBe(0);
      expect(output.byteLength).toBe(output.buffer.byteLength);
    }
  });
});
