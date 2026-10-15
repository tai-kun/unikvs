import type { IMiddleware } from "@unikvs/core";
import {
  createPseudoRandomBytes,
  createDecodeContext,
  createEncodeContext,
  createNext,
  createOpenContext,
} from "@unikvs/testing";
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

describe("インスタンスの状態", () => {
  test("encode と decode の後も name と isOpen は変化しない", async ({ expect }) => {
    // 準備
    const target = new ZstdWasm();
    await openTarget(target, createSignal());
    const input = createPseudoRandomBytes(128, 31);

    // 実行
    const encoded = await encode(target, input);
    await decode(target, encoded);

    // 検証
    expect(target.name).toBe("ZstdWasm");
    expect(target.isOpen).toBe(true);
  });

  test("decode が失敗しても isOpen は true のままである", async ({ expect }) => {
    // 準備
    const target = new ZstdWasm();
    await openTarget(target, createSignal());
    const invalidData = new Uint8Array([0, 1, 2, 3]);

    // 実行と検証
    await expect(decode(target, invalidData)).rejects.toThrow(Error);
    expect(target.isOpen).toBe(true);
  });
});

describe("インスタンスの独立性", () => {
  test("異なるレベルの複数インスタンスを同時に使っても互いに影響しない", async ({ expect }) => {
    // 準備
    const instances = [1, 3, 10, 22].map((level) => new ZstdWasm({ level }));
    await Promise.all(instances.map((target) => openTarget(target, createSignal())));
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
      expect(target.name).toBe("ZstdWasm");
      expect(target.isOpen).toBe(true);
    }
  });

  test("同一レベルと異なるレベルのインスタンス間で展開互換がある", async ({ expect }) => {
    // 準備
    const low = new ZstdWasm({ level: 1 });
    const high = new ZstdWasm({ level: 22 });
    await openTarget(low, createSignal());
    await openTarget(high, createSignal());
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
  test("encode と decode は引数の data を変更しない", async ({ expect }) => {
    // 準備
    const target = new ZstdWasm();
    await openTarget(target, createSignal());
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

describe("ストリーム API の非提供", () => {
  test("encodeStream と decodeStream を持たない", ({ expect }) => {
    // 準備
    const target = new ZstdWasm();

    // 実行と検証
    expect("encodeStream" in target).toBe(false);
    expect("decodeStream" in target).toBe(false);
    expect((target as unknown as Record<string, unknown>)["encodeStream"]).toBeUndefined();
    expect((target as unknown as Record<string, unknown>)["decodeStream"]).toBeUndefined();
  });
});
