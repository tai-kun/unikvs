import type { IMiddleware } from "@unikvs/core";
import {
  abortedSignal,
  captureRejection,
  createDecodeContext,
  createEncodeContext,
  createNext,
  createOpenContext,
} from "@unikvs/testing";
import { describe, test, vi } from "vitest";

import { api } from "../src/_core.js";
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

describe("open による初期化", () => {
  test("初期状態では isOpen が false である", ({ expect }) => {
    // 実行と検証
    expect(new ZstdWasm().isOpen).toBe(false);
  });

  test("open 成功で isOpen が true になる", async ({ expect, signal }) => {
    // 準備
    const target = new ZstdWasm();

    // 実行
    await openTarget(target, signal);

    // 検証
    expect(target.isOpen).toBe(true);
  });

  test("中断済み signal では open を拒否し isOpen は false のままである", async ({ expect }) => {
    // 準備
    const initSpy = vi.spyOn(api, "init");
    const target = new ZstdWasm();

    try {
      // 実行
      const error = await captureRejection(openTarget(target, abortedSignal()));

      // 検証
      // 事前中断では初期化自体を開始しない。
      expect(error).toBeInstanceOf(DOMException);
      expect(target.isOpen).toBe(false);
      expect(initSpy).not.toHaveBeenCalled();
    } finally {
      initSpy.mockRestore();
    }
  });

  test("open 後に encode と decode を実行できる", async ({ expect, signal }) => {
    // 準備
    const target = new ZstdWasm();
    const input = new Uint8Array([1, 2, 3]);

    // 実行
    await openTarget(target, signal);
    const encoded = await encode(target, input);
    const decoded = await decode(target, encoded);

    // 検証
    expect(target.isOpen).toBe(true);
    expect(decoded).toStrictEqual(input);
  });
});
