import type { IMiddleware } from "@unikvs/core";
import {
  concatBytes,
  createDecodeContext,
  createDecodeStreamContext,
  createEncodeContext,
  createEncodeStreamContext,
  createNext,
  createOpenContext,
  createPseudoRandomBytes,
  readAll,
  sourceFrom,
} from "@unikvs/testing";
import { describe, test } from "vitest";

import ZstdNode from "../src/zstd-node.js";

type ByteEncode = IMiddleware.EncodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>;
type ByteDecode = IMiddleware.DecodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>;
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
async function openTarget(target: ZstdNode, signal: AbortSignal): Promise<void> {
  await target.open(createOpenContext({ signal }) as IMiddleware.OpenContext);
}

/**
 * バイト列を圧縮して返します。
 */
async function encode(
  target: ZstdNode,
  data: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const c = createEncodeContext(data);
  await target.encode(c as ByteEncode, createNext());

  return c.destination;
}

/**
 * 圧縮されたバイト列を展開して返します。
 */
async function decode(
  target: ZstdNode,
  data: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const c = createDecodeContext(data);
  await target.decode(c as ByteDecode, createNext());

  return c.destination;
}

/**
 * チャンク列を圧縮ストリームに流し、出力チャンクを結合して返します。
 */
async function pumpEncode(
  target: ZstdNode,
  chunks: ReadonlyArray<Uint8Array<ArrayBuffer>>,
): Promise<Uint8Array<ArrayBuffer>> {
  const c = createEncodeStreamContext(sourceFrom(chunks));
  await target.encodeStream(c as ByteEncodeStream, createNext());

  return concatBytes(
    await readAll(c.destination as ReadableStream<Uint8Array<ArrayBuffer>>),
  );
}

/**
 * チャンク列を展開ストリームに流し、出力チャンクを結合して返します。
 */
async function pumpDecode(
  target: ZstdNode,
  chunks: ReadonlyArray<Uint8Array<ArrayBuffer>>,
): Promise<Uint8Array<ArrayBuffer>> {
  const c = createDecodeStreamContext(sourceFrom(chunks));
  await target.decodeStream(c as ByteDecodeStream, createNext());

  return concatBytes(
    await readAll(c.destination as ReadableStream<Uint8Array<ArrayBuffer>>),
  );
}

/**
 * バイト列を指定幅で分割します。
 */
function splitIntoChunks(
  data: Uint8Array<ArrayBuffer>,
  width: number,
): Array<Uint8Array<ArrayBuffer>> {
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];

  for (let offset = 0; offset < data.byteLength; offset += width) {
    chunks.push(data.slice(offset, offset + width));
  }

  return chunks;
}

describe("インスタンスの状態", () => {
  test("初期状態で isOpen が false であり open 後に true になる", async ({ expect, signal }) => {
    // 準備
    const target = new ZstdNode();
    const input = createPseudoRandomBytes(128, 31);

    // 実行
    expect(target.isOpen).toBe(false);
    await openTarget(target, signal);
    const encoded = await encode(target, input);
    await decode(target, encoded);

    // 検証
    expect(target.name).toBe("ZstdNode");
    expect(target.isOpen).toBe(true);
  });

  test("decode が失敗しても isOpen は true のままである", async ({ expect, signal }) => {
    // 準備
    const target = new ZstdNode();
    await openTarget(target, signal);
    const invalidData = new Uint8Array([0, 1, 2, 3]);

    // 実行と検証
    await expect(decode(target, invalidData)).rejects.toThrow(Error);
    expect(target.isOpen).toBe(true);
  });

  test("open 前の encode と decode は TypeError で拒否される", async ({ expect }) => {
    // 準備
    // 実装は open() で解決した実行環境を必須とするため、未 open の使用は TypeError になる。
    const target = new ZstdNode();
    const input = createPseudoRandomBytes(128, 37);

    // 実行と検証
    expect(target.isOpen).toBe(false);
    await expect(encode(target, input)).rejects.toThrow(TypeError);
    await expect(decode(target, input)).rejects.toThrow(TypeError);
  });

  test("open を持ち close を持たない", async ({ expect, signal }) => {
    // 準備
    const target = new ZstdNode();

    // 実行と検証
    expect(target.isOpen).toBe(false);
    expect(typeof target.open).toBe("function");
    expect("close" in target).toBe(false);

    await openTarget(target, signal);
    expect(target.isOpen).toBe(true);
  });
});

describe("インスタンスの独立性", () => {
  test("異なるレベルの複数インスタンスを同時に使っても互いに影響しない", async ({
    expect,
    signal,
  }) => {
    // 準備
    const instances = [1, 3, 10, 22].map((level) => new ZstdNode({ level }));
    await Promise.all(instances.map(async (target) => await openTarget(target, signal)));
    const input = createPseudoRandomBytes(2048, 32);

    // 実行
    const decodedList = await Promise.all(
      instances.map(async (target) => decode(target, await encode(target, input))),
    );

    // 検証
    for (const decoded of decodedList) {
      expect(decoded).toStrictEqual(input);
    }

    for (const target of instances) {
      expect(target.name).toBe("ZstdNode");
      expect(target.isOpen).toBe(true);
    }
  });

  test("同一レベルと異なるレベルのインスタンス間で展開互換がある", async ({ expect, signal }) => {
    // 準備
    const low = new ZstdNode({ level: 1 });
    const high = new ZstdNode({ level: 22 });
    await openTarget(low, signal);
    await openTarget(high, signal);
    const input = createPseudoRandomBytes(512, 34);

    // 実行
    const decodedLow = await decode(high, await encode(low, input));
    const decodedHigh = await decode(low, await encode(high, input));

    // 検証
    expect(decodedLow).toStrictEqual(input);
    expect(decodedHigh).toStrictEqual(input);
  });
});

describe("入力データの非破壊性", () => {
  test("encode と decode は引数の data を変更しない", async ({ expect, signal }) => {
    // 準備
    const target = new ZstdNode();
    await openTarget(target, signal);
    const input = createPseudoRandomBytes(1024, 33);
    const inputSnapshot = input.slice();

    // 実行
    const encoded = await encode(target, input);
    const encodedSnapshot = encoded.slice();
    const decoded = await decode(target, encoded);

    // 検証
    expect(input).toStrictEqual(inputSnapshot);
    expect(encoded).toStrictEqual(encodedSnapshot);
    expect(decoded).toStrictEqual(input);
  });
});

describe("ストリーム API の提供", () => {
  test("encodeStream と decodeStream を持つ", ({ expect }) => {
    // 準備
    const target = new ZstdNode();

    // 実行と検証
    expect(typeof target.encodeStream).toBe("function");
    expect(typeof target.decodeStream).toBe("function");
  });

  test("open 前に呼ぶと TypeError で拒否される", async ({ expect }) => {
    // 準備
    // 実装は open() で解決した実行環境を必須とするため、未 open の使用は TypeError になる。
    const target = new ZstdNode();
    const input = [new Uint8Array([1])];

    // 実行と検証
    const encodeContext = createEncodeStreamContext(sourceFrom(input));
    await expect(target.encodeStream(encodeContext as ByteEncodeStream, createNext())).rejects.toThrow(
      TypeError,
    );
    const decodeContext = createDecodeStreamContext(sourceFrom(input));
    await expect(target.decodeStream(decodeContext as ByteDecodeStream, createNext())).rejects.toThrow(
      TypeError,
    );
  });

  test("分割書き込みしてもストリームで往復できる", async ({ expect, signal }) => {
    // 準備
    const target = new ZstdNode();
    await openTarget(target, signal);
    const input = createPseudoRandomBytes(4096, 35);

    // 実行
    const encoded = await pumpEncode(target, splitIntoChunks(input, 7));
    const decoded = await pumpDecode(target, splitIntoChunks(encoded, 5));

    // 検証
    expect(decoded).toStrictEqual(input);
  });

  test("Buffer を書き込んでもストリームで往復できる", async ({ expect, signal }) => {
    // 準備
    // Node の Buffer 入力は複写せずそのまま渡す分岐を通る。
    const target = new ZstdNode();
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
    const target = new ZstdNode();
    await openTarget(target, signal);
    const input = createPseudoRandomBytes(256, 36);
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
