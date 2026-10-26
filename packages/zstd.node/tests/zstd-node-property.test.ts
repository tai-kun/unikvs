import type { IMiddleware } from "@unikvs/core";
import {
  bytesEqual,
  createNext,
  forCasesAsync,
  createOpenContext,
  createDecodeContext,
  createEncodeContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import ZstdNode from "../src/zstd-node.js";

type ByteEncode = IMiddleware.EncodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>;

type ByteDecode = IMiddleware.DecodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>;

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

const SEED = 20_240_927;
const CASE_COUNT = 50;
const LEVELS = [undefined, 1, 3, 10, 22] as const;
describe("決定的ファズテスト", () => {
  test("ランダムなバイト列をランダムなレベルで往復すると元のデータに戻る", async ({
    expect,
    signal,
  }) => {
    // 実行と検証：
    await forCasesAsync(SEED, CASE_COUNT, async (random) => {
      const levelIndex = random.uint(LEVELS.length - 1);
      const level = LEVELS[levelIndex];
      const input = random.bytes(random.uint(2048));
      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      const target = level === undefined ? new ZstdNode() : new ZstdNode({ level });
      await openTarget(target, signal);

      const encoded = await encode(target, input);
      const decoded = await decode(target, encoded);
      expect(bytesEqual(decoded, input)).toBe(true);
    });
  }, 30_000);
});
