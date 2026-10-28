import type { IMiddleware } from "@unikvs/core";
import {
  readAll,
  createNext,
  sourceFrom,
  createDecodeContext,
  createDecodeStreamContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import Cbor from "../src/cbor.js";

const cbor = new Cbor();

/**
 * CBOR のバイト列を値へ変換します。
 */
async function decode(data: Uint8Array<ArrayBuffer>): Promise<unknown> {
  const c = createDecodeContext(data);
  await cbor.decode(c as IMiddleware.DecodeContext, createNext());

  return c.destination;
}

describe("Buffer を入力にしたデコード", () => {
  test("一括デコードとストリームデコードはバイト文字列を同じ型で返す", async ({ expect }) => {
    // 準備：
    const bytes = Uint8Array.of(0x43, 1, 2, 3);
    const pool = Buffer.alloc(bytes.byteLength + 32);
    const source = pool.subarray(16, 16 + bytes.byteLength);
    source.set(bytes);

    // 実行：
    const batch = (await decode(source)) as Uint8Array;
    const c = createDecodeStreamContext(sourceFrom([source]));
    await cbor.decodeStream(c as IMiddleware.DecodeStreamContext, createNext());

    const [streamed] = (await readAll(c.destination as ReadableStream<unknown>)) as [Uint8Array];

    // 検証：
    expect(batch.constructor).toBe(Uint8Array);
    expect(streamed.constructor).toBe(Uint8Array);
    expect(batch).toStrictEqual(streamed);
    expect(batch).toStrictEqual(Uint8Array.of(1, 2, 3));
  });
});
