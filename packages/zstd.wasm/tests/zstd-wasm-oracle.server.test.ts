import { zstdCompressSync, createZstdCompress, zstdDecompressSync } from "node:zlib";

import type { IMiddleware } from "@unikvs/core";
import {
  bytesEqual,
  createNext,
  createOpenContext,
  createDecodeContext,
  createEncodeContext,
  createPseudoRandomBytes,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import ZstdWasm from "../src/zstd-wasm.js";

type ByteEncode = IMiddleware.EncodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>;

type ByteDecode = IMiddleware.DecodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>;

/**
 * ターゲットを開きます。
 */
async function openTarget(target: ZstdWasm, signal: AbortSignal): Promise<void> {
  await target.open(createOpenContext({ signal }) as IMiddleware.OpenContext);
}

/**
 * バイト列を圧縮して返します。
 */
async function encode(
  target: ZstdWasm,
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
  target: ZstdWasm,
  data: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const c = createDecodeContext(data);
  await target.decode(c as ByteDecode, createNext());

  return c.destination;
}

/**
 * 中断されていないシグナルを作成します。
 */
function createSignal(): AbortSignal {
  return new AbortController().signal;
}

/**
 * node:zlib の zstd 圧縮ストリームでデータを圧縮し、1 つのバイト列にまとめて返します。
 *
 * ストリーミング圧縮のフレームは展開後サイズを保持しないため、既定のヒープサイズを超える展開結果の相互運用を検証できます。
 *
 * @param data 圧縮するバイト列です。
 *
 * @returns 圧縮したバイト列を返します。
 */
async function compressWithStream(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const chunks: Buffer[] = [];
  const stream = createZstdCompress();
  const completed = new Promise<void>((resolve, reject) => {
    stream.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  stream.end(data);
  await completed;

  return new Uint8Array(Buffer.concat(chunks));
}

// node:zlib の zstd 系 API が利用できない Node 版では当該テスト群をスキップし、理由をコメントに残す。
// ブラウザーに node:zlib はないため、オラクル検証は server のみに限定する。
const hasZstd = typeof zstdCompressSync === "function" && typeof zstdDecompressSync === "function";
describe.skipIf(!hasZstd)("node:zlib との相互運用", () => {
  test("node:zlib で圧縮したフレームを decode で展開できる", async ({ expect }) => {
    // 準備：
    const target = new ZstdWasm();
    await openTarget(target, createSignal());

    const input = createPseudoRandomBytes(1024, 15);
    const compressed = zstdCompressSync(input);

    // 実行：
    const decoded = await decode(target, new Uint8Array(compressed));

    // 検証：
    expect(decoded).toStrictEqual(input);
  });

  test("encode の出力を node:zlib で展開できる", async ({ expect }) => {
    // 準備：
    const target = new ZstdWasm();
    await openTarget(target, createSignal());

    const input = createPseudoRandomBytes(1024, 16);

    // 実行：
    const encoded = await encode(target, input);
    const decompressed = zstdDecompressSync(encoded);

    // 検証：
    expect(new Uint8Array(decompressed)).toStrictEqual(input);
  });

  test("ストリーミング圧縮で作った 1 MiB 超のフレームを decode で展開できる", async ({
    expect,
  }) => {
    // 準備：
    // createZstdCompress のフレームは展開後サイズを保持しないため、上流の既定ヒープサイズ (1 MiB) を超えると展開に失敗する。
    const target = new ZstdWasm();
    await openTarget(target, createSignal());

    const input = createPseudoRandomBytes(2 * 1024 * 1024, 17);
    const compressed = await compressWithStream(input);

    // 実行：
    const decoded = await decode(target, compressed);

    // 検証：
    expect(bytesEqual(decoded, input)).toBe(true);
  }, 30_000);
});
