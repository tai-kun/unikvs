import type { IMiddleware } from "@unikvs/core";
import {
  bytesEqual,
  createAllByteValues,
  createDecodeContext,
  createEncodeContext,
  createNext,
  createOpenContext,
  createPseudoRandomBytes,
} from "@unikvs/testing";
import { describe, test } from "vitest";

import BrotliWasm, { type BrotliWasmOptions } from "../src/brotli-wasm.js";

type ByteEncode = IMiddleware.EncodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>;
type ByteDecode = IMiddleware.DecodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>;

/**
 * 開済みのターゲットを作成します。
 */
async function createOpenedTarget(
  signal: AbortSignal,
  options?: BrotliWasmOptions,
): Promise<BrotliWasm> {
  const target = new BrotliWasm(options);
  await target.open(createOpenContext({ signal }) as IMiddleware.OpenContext);

  return target;
}

/**
 * バイト列を圧縮して返します。
 */
async function encode(
  target: BrotliWasm,
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
  target: BrotliWasm,
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

/**
 * JSON フィクスチャの入力データを作成します。
 */
function createJsonInput(): Uint8Array<ArrayBuffer> {
  const value = {
    users: Array.from({ length: 50 }, (_, index) => ({
      id: index,
      name: `user-${index}`,
      email: `user-${index}@example.com`,
      roles: ["reader", "editor"],
      active: index % 2 === 0,
    })),
    meta: { version: 1, generatedAt: "2026-10-19T00:00:00.000Z", tags: ["brotli", "web", "text"] },
  };

  return new TextEncoder().encode(JSON.stringify(value));
}

describe("初期化と基本属性", () => {
  test("name プロパティは BrotliWasm を返す", ({ expect }) => {
    // 実行と検証
    expect(new BrotliWasm().name).toBe("BrotliWasm");
  });

  test("初期状態で isOpen が false であり open 後に true になる", async ({ expect, signal }) => {
    // 準備
    const target = new BrotliWasm();

    // 実行と検証
    expect(target.isOpen).toBe(false);
    await target.open(createOpenContext({ signal }) as IMiddleware.OpenContext);
    expect(target.isOpen).toBe(true);
  });

  test("open を持ち close を持たない", ({ expect }) => {
    // 準備
    const target = new BrotliWasm();

    // 実行と検証
    expect(typeof target.open).toBe("function");
    expect("close" in target).toBe(false);
  });

  test("ストリーミング API を持たない", ({ expect }) => {
    // 準備
    const target = new BrotliWasm();

    // 実行と検証
    expect("encodeStream" in target).toBe(false);
    expect("decodeStream" in target).toBe(false);
  });
});

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

  test("JSON フィクスチャを往復すると元のデータに戻る", async ({ expect, signal }) => {
    // 準備
    const target = await createOpenedTarget(signal);
    const input = createJsonInput();

    // 実行
    const encoded = await encode(target, input);
    const decoded = await decode(target, encoded);

    // 検証
    expect(encoded.byteLength).toBeLessThan(input.byteLength);
    expect(decoded).toStrictEqual(input);
    expect(JSON.parse(new TextDecoder().decode(decoded))).toStrictEqual(
      JSON.parse(new TextDecoder().decode(input)),
    );
  });

  test("すべてのバイト値を含むデータを往復すると元のデータに戻る", async ({ expect, signal }) => {
    // 準備
    // バイナリーセーフであることを検証する。
    const target = await createOpenedTarget(signal);
    const input = createAllByteValues(1024);

    // 実行
    const decoded = await decode(target, await encode(target, input));

    // 検証
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
    for (const level of [0, 1, 6, 11]) {
      const target = await createOpenedTarget(signal, { level });
      const decoded = await decode(target, await encode(target, input));
      expect(decoded, `level=${level}`).toStrictEqual(input);
    }
  });

  test("異なるレベルのインスタンス間で展開互換がある", async ({ expect, signal }) => {
    // 準備
    const low = await createOpenedTarget(signal, { level: 0 });
    const high = await createOpenedTarget(signal, { level: 11 });
    const input = createPseudoRandomBytes(512, 13);

    // 実行
    const decodedLow = await decode(high, await encode(low, input));
    const decodedHigh = await decode(low, await encode(high, input));

    // 検証
    expect(decodedLow).toStrictEqual(input);
    expect(decodedHigh).toStrictEqual(input);
  });

  test("1 MiB のランダムデータを往復しても元のデータに戻る", async ({ expect, signal }) => {
    // 準備
    const target = await createOpenedTarget(signal);
    const input = createPseudoRandomBytes(1024 * 1024, 14);

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

describe("コンストラクターオプション", () => {
  test("空のオプションでは既定と等価に往復できる", async ({ expect, signal }) => {
    // 準備
    const options: BrotliWasmOptions = {};
    const target = await createOpenedTarget(signal, options);
    const input = Uint8Array.from([0xfb, 0xff]);

    // 実行
    const decoded = await decode(target, await encode(target, input));

    // 検証
    expect(decoded).toStrictEqual(input);
    expect(target.name).toBe("BrotliWasm");
  });

  test("level の既定は 11 であり明示 11 と等価である", async ({ expect, signal }) => {
    // 準備
    const input = Uint8Array.from([0x66, 0x6f, 0x6f, 0x62, 0x61, 0x72]);
    const omittedTarget = await createOpenedTarget(signal);
    const explicitTarget = await createOpenedTarget(signal, { level: 11 });

    // 実行
    const omitted = await encode(omittedTarget, input);
    const explicit = await encode(explicitTarget, input);

    // 検証
    expect(bytesEqual(omitted, explicit)).toBe(true);
  });

  test("level 省略と undefined 明示は等価である", async ({ expect, signal }) => {
    // 準備
    const input = Uint8Array.from([0x66, 0x6f, 0x6f, 0x62, 0x61, 0x72]);
    const omittedTarget = await createOpenedTarget(signal);
    const undefinedTarget = await createOpenedTarget(signal, { level: undefined });

    // 実行
    const omitted = await encode(omittedTarget, input);
    const undefinedLevel = await encode(undefinedTarget, input);

    // 検証
    expect(bytesEqual(omitted, undefinedLevel)).toBe(true);
  });

  test("level に null を明示すると BrotliWasmInvalidLevelError で拒否される", async ({
    expect,
    signal,
  }) => {
    // 準備
    const { BrotliWasmInvalidLevelError } = await import("../src/errors.js");

    // 実行と検証
    // 実装は規定値への吸収に null を含めず、無効値として拒否する。
    expect(
      () =>
        new BrotliWasm({
          level: null as unknown as BrotliWasmOptions["level"],
        }),
    ).toThrow(BrotliWasmInvalidLevelError);
    expect(signal.aborted).toBe(false);
  });
});

describe("入力データの非破壊性", () => {
  test("encode と decode は引数の data を変更しない", async ({ expect, signal }) => {
    // 準備
    const target = await createOpenedTarget(signal);
    const input = createPseudoRandomBytes(1024, 15);
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
