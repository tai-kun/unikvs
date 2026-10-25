import type { IMiddleware } from "@unikvs/core";
import {
  createNext,
  createOpenContext,
  createDecodeContext,
  createEncodeContext,
  createPseudoRandomBytes,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

// oxlint-disable unicorn/number-literal-case
import ZstdNode from "../src/zstd-node.js";

type ByteEncode = IMiddleware.EncodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>;

type ByteDecode = IMiddleware.DecodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>;

/**
 * 書き込みエラーまたは読み取りエラーを取り出します。
 */
function getStreamError(writeError: unknown, readError: unknown): unknown {
  return writeError ?? readError;
}

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

describe("zstd フレーム", () => {
  test("encode したデータは zstd のマジックバイトで始まる", async ({ expect, signal }) => {
    // 準備：
    const target = new ZstdNode();
    await openTarget(target, signal);

    const input = createPseudoRandomBytes(512, 7);

    // 実行：
    const encoded = await encode(target, input);

    // 検証：
    // zstd マジック 0xFD2FB528 のリトルエンディアン先頭 4 バイトです。
    expect(Array.from(encoded.subarray(0, 4))).toStrictEqual([0x28, 0xb5, 0x2f, 0xfd]);
  });

  test("異なるレベルで圧縮したデータは互いに展開できる", async ({ expect, signal }) => {
    // 準備：
    const input = createPseudoRandomBytes(1024, 8);
    const low = new ZstdNode({ level: 1 });
    const high = new ZstdNode({ level: 22 });
    await openTarget(low, signal);
    await openTarget(high, signal);

    // 実行：
    const decodedLow = await decode(high, await encode(low, input));
    const decodedHigh = await decode(low, await encode(high, input));

    // 検証：
    expect(decodedLow).toStrictEqual(input);
    expect(decodedHigh).toStrictEqual(input);
  });
});

describe("他形式との非互換", () => {
  test("gzip データを decode するとエラーで拒否される", async ({ expect, signal }) => {
    // 準備：
    const target = new ZstdNode();
    await openTarget(target, signal);

    const input = createPseudoRandomBytes(512, 9);
    const source = new CompressionStream("gzip");
    const reading = new Response(source.readable).arrayBuffer();
    const writer = source.writable.getWriter();

    // 実行：
    await writer.write(input);
    await writer.close();

    const gzipData = new Uint8Array(await reading);

    // 検証：
    // 実装は展開失敗を専用エラーで包まず上流エラーをそのまま伝搬するため、汎用エラーを検証する。
    await expect(decode(target, gzipData)).rejects.toThrow(Error);
  });

  test("deflate データを decode するとエラーで拒否される", async ({ expect, signal }) => {
    // 準備：
    const target = new ZstdNode();
    await openTarget(target, signal);

    const input = createPseudoRandomBytes(512, 17);
    const source = new CompressionStream("deflate");
    const reading = new Response(source.readable).arrayBuffer();
    const writer = source.writable.getWriter();

    // 実行：
    await writer.write(input);
    await writer.close();

    const deflateData = new Uint8Array(await reading);

    // 検証：
    await expect(decode(target, deflateData)).rejects.toThrow(Error);
  });

  test("deflate-raw データを decode するとエラーで拒否される", async ({ expect, signal }) => {
    // 準備：
    const target = new ZstdNode();
    await openTarget(target, signal);

    const input = createPseudoRandomBytes(512, 18);
    const source = new CompressionStream("deflate-raw");
    const reading = new Response(source.readable).arrayBuffer();
    const writer = source.writable.getWriter();

    // 実行：
    await writer.write(input);
    await writer.close();

    const rawDeflateData = new Uint8Array(await reading);

    // 検証：
    await expect(decode(target, rawDeflateData)).rejects.toThrow(Error);
  });

  test("zstd データを gzip として decode すると拒否される", async ({ expect, signal }) => {
    // 準備：
    const target = new ZstdNode();
    await openTarget(target, signal);

    const input = createPseudoRandomBytes(512, 10);
    const encoded = await encode(target, input);
    const source = new DecompressionStream("gzip");
    const writer = source.writable.getWriter();
    // oxlint-disable-next-line promise/prefer-await-to-then
    const reading = new Response(source.readable).arrayBuffer().then(
      (buffer) => ({
        error: undefined as unknown,
        buffer,
      }),
      (error: unknown) => ({
        error,
        buffer: undefined as unknown as ArrayBuffer,
      }),
    );

    // 実行：
    // oxlint-disable-next-line promise/prefer-await-to-then
    const writeError = await writer.write(encoded).then(
      () =>
        writer.close().then(
          () => undefined as unknown,
          (error: unknown) => error,
        ),
      (error: unknown) => error,
    );
    const { error: readError } = await reading;

    // 検証：
    expect(getStreamError(writeError, readError)).toBeInstanceOf(Error);
  });
});
