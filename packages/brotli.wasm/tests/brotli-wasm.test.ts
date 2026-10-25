import type { IMiddleware } from "@unikvs/core";
import {
  bytesEqual,
  createNext,
  createOpenContext,
  createAllByteValues,
  createDecodeContext,
  createEncodeContext,
  createPseudoRandomBytes,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

// oxlint-disable unicorn/number-literal-case
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
    meta: {
      tags: ["brotli", "web", "text"],
      version: 1,
      generatedAt: "2026-10-19T00:00:00.000Z",
    },
    users: Array.from({ length: 50 }, (_, index) => ({
      id: index,
      name: `user-${index}`,
      email: `user-${index}@example.com`,
      roles: ["reader", "editor"],
      active: index % 2 === 0,
    })),
  };

  return new TextEncoder().encode(JSON.stringify(value));
}

describe("初期化と基本属性", () => {
  test("name プロパティは BrotliWasm を返す", ({ expect }) => {
    // 実行と検証：
    expect(new BrotliWasm().name).toBe("BrotliWasm");
  });

  test("初期状態で isOpen が false であり open 後に true になる", async ({ expect, signal }) => {
    // 準備：
    const target = new BrotliWasm();

    // 実行と検証：
    expect(target.isOpen).toBe(false);
    await target.open(createOpenContext({ signal }) as IMiddleware.OpenContext);
    expect(target.isOpen).toBe(true);
  });

  test("open を持ち close を持たない", ({ expect }) => {
    // 準備：
    const target = new BrotliWasm();

    // 実行と検証：
    expect(typeof target.open).toBe("function");
    expect("close" in target).toBe(false);
  });

  test("ストリーミング API を持たない", ({ expect }) => {
    // 準備：
    const target = new BrotliWasm();

    // 実行と検証：
    expect("encodeStream" in target).toBe(false);
    expect("decodeStream" in target).toBe(false);
  });
});

describe("往復", () => {
  test("反復テキストを既定レベルで往復すると元のデータに戻る", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const input = createRepetitiveInput();

    // 実行：
    const encoded = await encode(target, input);
    const decoded = await decode(target, encoded);

    // 検証：
    expect(encoded.buffer).toBeInstanceOf(ArrayBuffer);
    expect(encoded.byteOffset).toBe(0);
    expect(decoded).toStrictEqual(input);
  });

  test("JSON フィクスチャを往復すると元のデータに戻る", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const input = createJsonInput();

    // 実行：
    const encoded = await encode(target, input);
    const decoded = await decode(target, encoded);

    // 検証：
    expect(encoded.byteLength).toBeLessThan(input.byteLength);
    expect(decoded).toStrictEqual(input);
  });

  test("すべてのバイト値を含むデータを往復すると元のデータに戻る", async ({ expect, signal }) => {
    // 準備：
    // バイナリーセーフであることを検証する。
    const target = await createOpenedTarget(signal);
    const input = createAllByteValues(1024);

    // 実行：
    const decoded = await decode(target, await encode(target, input));

    // 検証：
    expect(decoded).toStrictEqual(input);
  });

  test("空入力を往復すると空出力に戻る", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const input = new Uint8Array(0);

    // 実行：
    const encoded = await encode(target, input);
    const decoded = await decode(target, encoded);

    // 検証：
    expect(decoded).toStrictEqual(input);
  });

  test("明示レベルで往復すると元のデータに戻る", async ({ expect, signal }) => {
    // 準備：
    const input = createPseudoRandomBytes(4096, 12);

    // 実行と検証：
    for (const level of [0, 1, 6, 11]) {
      const target = await createOpenedTarget(signal, { level });
      const decoded = await decode(target, await encode(target, input));
      expect(decoded, `level=${level}`).toStrictEqual(input);
    }
  });

  test("異なるレベルのインスタンス間で展開互換がある", async ({ expect, signal }) => {
    // 準備：
    const low = await createOpenedTarget(signal, { level: 0 });
    const high = await createOpenedTarget(signal, { level: 11 });
    const input = createPseudoRandomBytes(512, 13);

    // 実行：
    const decodedLow = await decode(high, await encode(low, input));
    const decodedHigh = await decode(low, await encode(high, input));

    // 検証：
    expect(decodedLow).toStrictEqual(input);
    expect(decodedHigh).toStrictEqual(input);
  });

  test("1 MiB のランダムデータを往復しても元のデータに戻る", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const input = createPseudoRandomBytes(1024 * 1024, 14);

    // 実行：
    const decoded = await decode(target, await encode(target, input));

    // 検証：
    expect(bytesEqual(decoded, input)).toBe(true);
  }, 30_000);
});

describe("出力の所有化", () => {
  test("encode と decode の出力は自身の ArrayBuffer を所有する", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const input = createPseudoRandomBytes(256, 17);

    // 実行：
    const encoded = await encode(target, input);
    const decoded = await decode(target, encoded);

    // 検証：
    for (const [label, output] of [
      ["encode", encoded],
      ["decode", decoded],
    ] as const) {
      expect(output.buffer, label).toBeInstanceOf(ArrayBuffer);
      expect(output.byteOffset, label).toBe(0);
      expect(output.byteLength, label).toBe(output.buffer.byteLength);
    }
  });
});

describe("圧縮率の健全性", () => {
  test("反復テキストは入力より小さくなる", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const input = createRepetitiveInput();

    // 実行：
    const encoded = await encode(target, input);

    // 検証：
    expect(encoded.byteLength).toBeLessThan(input.byteLength);
  });

  test("level が高いほど反復テキストを小さく圧縮する", async ({ expect, signal }) => {
    // 準備：
    const input = createRepetitiveInput();
    const low = await createOpenedTarget(signal, { level: 0 });
    const high = await createOpenedTarget(signal, { level: 11 });

    // 実行：
    const lowEncoded = await encode(low, input);
    const highEncoded = await encode(high, input);

    // 検証：
    expect(highEncoded.byteLength).toBeLessThan(lowEncoded.byteLength);
  });
});

describe("コンストラクターオプション", () => {
  test("空のオプションを渡しても往復できる", async ({ expect, signal }) => {
    // 準備：
    const options: BrotliWasmOptions = {};
    const target = await createOpenedTarget(signal, options);
    const input = Uint8Array.from([0xfb, 0xff]);

    // 実行：
    const decoded = await decode(target, await encode(target, input));

    // 検証：
    expect(decoded).toStrictEqual(input);
  });

  test("level の既定は 11 であり省略と undefined 明示は等価である", async ({ expect, signal }) => {
    // 準備：
    const input = Uint8Array.from([0x66, 0x6f, 0x6f, 0x62, 0x61, 0x72]);
    const omittedTarget = await createOpenedTarget(signal);
    const explicitTarget = await createOpenedTarget(signal, { level: 11 });
    const undefinedTarget = await createOpenedTarget(signal, { level: undefined });

    // 実行：
    const omitted = await encode(omittedTarget, input);
    const explicit = await encode(explicitTarget, input);
    const undefinedLevel = await encode(undefinedTarget, input);

    // 検証：
    expect(bytesEqual(omitted, explicit)).toBe(true);
    expect(bytesEqual(omitted, undefinedLevel)).toBe(true);
  });
});

describe("ミドルウェア連鎖", () => {
  test("encode と decode は変換結果を設定してから next を1回呼ぶ", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const input = createPseudoRandomBytes(128, 16);
    const encodeContext = createEncodeContext(input);
    let encodeNextCalls = 0;
    let encodedAtNext: Uint8Array<ArrayBuffer> | undefined;

    // 実行：
    await target.encode(encodeContext as ByteEncode, (): Promise<void> => {
      encodeNextCalls += 1;
      encodedAtNext = encodeContext.destination;

      return Promise.resolve();
    });

    // 検証：
    expect(encodeNextCalls).toBe(1);
    expect(encodedAtNext).toBeInstanceOf(Uint8Array);
    expect(encodedAtNext).not.toBe(input);

    // 準備：
    const decodeContext = createDecodeContext(encodeContext.destination);
    let decodeNextCalls = 0;
    let decodedAtNext: Uint8Array<ArrayBuffer> | undefined;

    // 実行：
    await target.decode(decodeContext as ByteDecode, (): Promise<void> => {
      decodeNextCalls += 1;
      decodedAtNext = decodeContext.destination;

      return Promise.resolve();
    });

    // 検証：
    expect(decodeNextCalls).toBe(1);
    expect(decodedAtNext).toStrictEqual(input);
  });
});

describe("入力データの非破壊性", () => {
  test("encode と decode は引数の data を変更しない", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const input = createPseudoRandomBytes(1024, 15);
    const inputSnapshot = input.slice();

    // 実行：
    const encoded = await encode(target, input);
    const encodedSnapshot = encoded.slice();
    const decoded = await decode(target, encoded);

    // 検証：
    expect(input).toStrictEqual(inputSnapshot);
    expect(encoded).toStrictEqual(encodedSnapshot);
    expect(decoded).toStrictEqual(input);
  });
});
