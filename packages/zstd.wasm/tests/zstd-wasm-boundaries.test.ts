import type { IMiddleware } from "@unikvs/core";
import {
  bytesEqual,
  createNext,
  createOpenContext,
  createDecodeContext,
  createEncodeContext,
  createPseudoRandomBytes,
} from "@unikvs/testing";
import { test as vitest, describe } from "vite-plus/test";

// oxlint-disable unicorn/number-literal-case
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
 * 境界サイズと特殊パターンの入力データをまとめて生成します。
 * 1 MiB など再生成コストのあるデータをファイル内で共有するために使用します。
 */
function createBoundaryInputs(): ReadonlyMap<string, Uint8Array<ArrayBuffer>> {
  return new Map<string, Uint8Array<ArrayBuffer>>([
    ["0 バイト", new Uint8Array(0)],
    ["1 バイト (0x00)", new Uint8Array([0x00])],
    ["1 バイト (0xff)", new Uint8Array([0xff])],
    ["2 バイト (0x00 0xff)", new Uint8Array([0x00, 0xff])],
    ["内部に 0x00 を含むバイナリ", new Uint8Array([0xde, 0xad, 0x00, 0xbe, 0xef])],
    ["255 バイト", createPseudoRandomBytes(255, 1)],
    ["256 バイト", createPseudoRandomBytes(256, 2)],
    ["1 KiB", createPseudoRandomBytes(1024, 3)],
    ["すべて 0 の 1 KiB", new Uint8Array(1024)],
    ["すべて 0xff の 1 KiB", new Uint8Array(1024).fill(0xff)],
  ]);
}

const test = vitest.extend<{
  boundaryInputs: ReadonlyMap<string, Uint8Array<ArrayBuffer>>;
}>({
  boundaryInputs: [
    async ({}, use): Promise<void> => {
      await use(createBoundaryInputs());
    },
    { scope: "file" },
  ],
});
describe("境界サイズと特殊パターンの往復", () => {
  test("0 バイトから 1 KiB までの入力で元のデータに戻る", async ({ expect, boundaryInputs }) => {
    // 準備：
    const target = new ZstdWasm();
    await openTarget(target, createSignal());

    // 実行と検証：
    for (const [label, input] of boundaryInputs) {
      const encoded = await encode(target, input);
      const decoded = await decode(target, encoded);
      expect(decoded, label).toStrictEqual(input);
    }
  });

  test("1 MiB のランダムデータを往復しても元のデータに戻る", async ({ expect }) => {
    // 準備：
    const target = new ZstdWasm();
    await openTarget(target, createSignal());

    const input = createPseudoRandomBytes(1024 * 1024, 4);

    // 実行：
    const decoded = await decode(target, await encode(target, input));

    // 検証：
    expect(bytesEqual(decoded, input)).toBe(true);
  }, 30_000);
});
