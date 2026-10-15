import type { IMiddleware } from "@unikvs/core";
import {
  bytesEqual,
  createDecodeContext,
  createEncodeContext,
  createNext,
  createOpenContext,
  createPseudoRandomBytes,
} from "@unikvs/testing";
import { describe, test } from "vitest";

import ZstdNode from "../src/zstd-node.js";

type ByteEncode = IMiddleware.EncodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>;
type ByteDecode = IMiddleware.DecodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>;

/**
 * 開済みのターゲットを作成します。
 */
async function createOpenedTarget(signal: AbortSignal): Promise<ZstdNode> {
  const target = new ZstdNode();
  await target.open(createOpenContext({ signal }) as IMiddleware.OpenContext);

  return target;
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
 * 反復テキストの入力データを作成します。
 */
function createRepetitiveInput(): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(
    "Repeat this text multiple times to ensure compression efficiency. ".repeat(100),
  );
}

describe("往復", () => {
  test("反復テキストを既定レベルで往復すると元のデータに戻る", async ({ expect, signal }) => {
    // 準備
    const target = await createOpenedTarget(signal);
    const input = createRepetitiveInput();

    // 実行
    const encoded = await encode(target, input);
    const decoded = await decode(target, encoded);

    // 検証
    expect(encoded.buffer).toBeInstanceOf(ArrayBuffer);
    expect(encoded.byteOffset).toBe(0);
    expect(decoded).toStrictEqual(input);
  });

  test("疑似乱数を既定レベルで往復すると元のデータに戻る", async ({ expect, signal }) => {
    // 準備
    const target = await createOpenedTarget(signal);
    const input = createPseudoRandomBytes(4096, 11);

    // 実行
    const decoded = await decode(target, await encode(target, input));

    // 検証
    expect(decoded).toStrictEqual(input);
  });

  test("空入力を往復すると空出力に戻る", async ({ expect, signal }) => {
    // 準備
    // 上流の実測では空入力の圧縮は空フレームを返し、展開で空出力に戻る。
    const target = await createOpenedTarget(signal);
    const input = new Uint8Array(0);

    // 実行
    const encoded = await encode(target, input);
    const decoded = await decode(target, encoded);

    // 検証
    expect(decoded).toStrictEqual(input);
  });

  test("明示レベルで往復すると元のデータに戻る", async ({ expect, signal }) => {
    // 準備
    const input = createPseudoRandomBytes(4096, 12);

    // 実行と検証
    for (const level of [1, 10, 22]) {
      const target = new ZstdNode({ level });
      await target.open(createOpenContext({ signal }) as IMiddleware.OpenContext);
      const decoded = await decode(target, await encode(target, input));
      expect(decoded, `level=${level}`).toStrictEqual(input);
    }
  });

  test("1 MiB のランダムデータを往復しても元のデータに戻る", async ({ expect, signal }) => {
    // 準備
    const target = await createOpenedTarget(signal);
    const input = createPseudoRandomBytes(1024 * 1024, 13);

    // 実行
    const decoded = await decode(target, await encode(target, input));

    // 検証
    expect(bytesEqual(decoded, input)).toBe(true);
  }, 30_000);

  test("4 MiB の反復データを往復しても元のデータに戻る", async ({ expect, signal }) => {
    // 準備
    const target = await createOpenedTarget(signal);
    const input = new TextEncoder().encode("0123456789abcdef".repeat((4 * 1024 * 1024) / 16));

    // 実行
    const decoded = await decode(target, await encode(target, input));

    // 検証
    expect(bytesEqual(decoded, input)).toBe(true);
  }, 30_000);
});

describe("圧縮率の健全性", () => {
  test("反復テキストは入力より小さくなる", async ({ expect, signal }) => {
    // 準備
    const target = await createOpenedTarget(signal);
    const input = createRepetitiveInput();

    // 実行
    const encoded = await encode(target, input);

    // 検証
    expect(encoded.byteLength).toBeLessThan(input.byteLength);
  });
});

describe("余剰キー", () => {
  test("コンテキストの余剰変数を付けても無視して往復できる", async ({ expect, signal }) => {
    // 準備
    const target = await createOpenedTarget(signal);
    const input = createPseudoRandomBytes(128, 14);

    // 実行
    const encodeContext = createEncodeContext(input, "", { values: { extra: true } });
    await target.encode(encodeContext as ByteEncode, createNext());
    const decoded = await decode(target, encodeContext.destination);

    // 検証
    expect(decoded).toStrictEqual(input);
  });
});
