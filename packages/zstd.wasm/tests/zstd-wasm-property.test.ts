import type { IMiddleware } from "@unikvs/core";
import {
  forCasesAsync,
  createDecodeContext,
  createEncodeContext,
  createNext,
  createOpenContext,
} from "@unikvs/testing";
import { bytesEqual } from "@unikvs/testing";
import { describe, test } from "vitest";

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

const SEED = 20240927;
const CASE_COUNT = 50;
const LEVELS = [undefined, 1, 3, 10, 22] as const;

describe("決定的ファズテスト", () => {
  test("ランダムなバイト列をランダムなレベルで往復すると元のデータに戻る", async ({ expect }) => {
    // 実行と検証
    await forCasesAsync(SEED, CASE_COUNT, async (random) => {
      const level = random.pick(LEVELS);
      const input = random.bytes(random.uint(2048));
      const target = level === undefined ? new ZstdWasm() : new ZstdWasm({ level });
      await openTarget(target, createSignal());

      const encoded = await encode(target, input);
      const decoded = await decode(target, encoded);

      expect(bytesEqual(decoded, input)).toBe(true);
    });
  });
});
