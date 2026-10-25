import { zstdCompressSync, zstdDecompressSync } from "node:zlib";

import type { IMiddleware } from "@unikvs/core";
import {
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

// node:zlib の zstd 系 API が利用できない Node 版では当該 2 件をスキップし、理由をコメントに残す。
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
});
