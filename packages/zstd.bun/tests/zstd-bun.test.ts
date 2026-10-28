// oxlint-disable import/no-namespace, unicorn/number-literal-case
import { constants, zstdCompressSync, zstdDecompressSync } from "node:zlib";

import type { IMiddleware } from "@unikvs/core";
import {
  bytesEqual,
  createNext,
  captureThrown,
  createOpenContext,
  createDecodeContext,
  createEncodeContext,
  createPseudoRandomBytes,
} from "@unikvs/testing";
import { setGlobalConfig, deleteGlobalConfig } from "valibot";
import { test, describe, expectTypeOf } from "vite-plus/test";

import { UnsupportedRuntimeError, ZstdBunInvalidLevelError } from "../src/errors.js";
import * as index from "../src/index.js";
import type {
  UnsupportedRuntimeErrorArgs,
  UnsupportedRuntimeErrorMeta,
  ZstdBunInvalidLevelErrorArgs,
  ZstdBunInvalidLevelErrorMeta,
} from "../src/index.js";
import ZstdBun, { type ZstdBunOptions } from "../src/zstd-bun.js";
import { createLevelSensitiveInput } from "./_fixtures.js";

type ByteEncode = IMiddleware.EncodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>;

type ByteDecode = IMiddleware.DecodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>;

/**
 * 開済みのターゲットを作成します。
 */
async function createOpenedTarget(signal: AbortSignal): Promise<ZstdBun> {
  const target = new ZstdBun();
  await target.open(createOpenContext({ signal }) as IMiddleware.OpenContext);

  return target;
}

/**
 * バイト列を圧縮して返します。
 */
async function encode(
  target: ZstdBun,
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
  target: ZstdBun,
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
 * Bun の zstd API のプローブです。
 */
type BunZstdProbe = {
  /**
   * 圧縮関数です。
   */
  readonly zstdCompressSync: unknown;

  /**
   * 展開関数です。
   */
  readonly zstdDecompressSync: unknown;
};

/**
 * Bun の zstd API を解決します。
 */
function resolveBunZstd(): BunZstdProbe | undefined {
  let resolved: BunZstdProbe | undefined;

  // `Bun` は @types/bun により宣言されているため、typeof による判定は安全です。
  // zstd 関数自体は宣言されていないため、unknown として取り出して判定します。
  if (typeof Bun !== "undefined") {
    const bun = Bun as unknown as Record<string, unknown>;

    if (
      typeof bun["zstdCompressSync"] === "function" &&
      typeof bun["zstdDecompressSync"] === "function"
    ) {
      resolved = bun as unknown as BunZstdProbe;
    }
  }

  return resolved;
}

const bunZstd = resolveBunZstd();
const hasBunZstd = bunZstd !== undefined;

/**
 * Bun の zstd API を取り出します。
 *
 * @returns Bun の zstd API を返します。
 */
function requireBunZstd(): BunZstdProbe {
  if (bunZstd === undefined) {
    throw new Error("Bun の zstd API が利用できません。");
  }

  return bunZstd;
}

/**
 * 破損対象のバイトを取り出します。
 *
 * @param value バイト値です。
 *
 * @returns バイト値を返します。
 */
function requireByte(value: number | undefined): number {
  if (value === undefined) {
    throw new Error("破損対象のバイトが存在しません。");
  }

  return value;
}

// node:zlib の zstd 系 API が利用できない Node 版では当該 2 件をスキップする。
const hasZstd = typeof zstdCompressSync === "function" && typeof zstdDecompressSync === "function";

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
    expect(encoded.byteLength).toBe(encoded.buffer.byteLength);
    expect(decoded.buffer).toBeInstanceOf(ArrayBuffer);
    expect(decoded.byteOffset).toBe(0);
    expect(decoded.byteLength).toBe(decoded.buffer.byteLength);
    expect(decoded).toStrictEqual(input);
  });

  test("疑似乱数を既定レベルで往復すると元のデータに戻る", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const input = createPseudoRandomBytes(4096, 11);

    // 実行：
    const decoded = await decode(target, await encode(target, input));

    // 検証：
    expect(decoded).toStrictEqual(input);
  });

  test("空入力を往復すると空出力に戻る", async ({ expect, signal }) => {
    // 準備：
    // 上流の実測では空入力の圧縮は空フレームを返し、展開で空出力に戻る。
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
    for (const level of [1, 10, 22]) {
      const target = new ZstdBun({ level });
      await target.open(createOpenContext({ signal }) as IMiddleware.OpenContext);

      const decoded = await decode(target, await encode(target, input));
      expect(decoded, `level=${level}`).toStrictEqual(input);
    }
  });

  test("1 MiB のランダムデータを往復しても元のデータに戻る", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const input = createPseudoRandomBytes(1024 * 1024, 13);

    // 実行：
    const decoded = await decode(target, await encode(target, input));

    // 検証：
    expect(bytesEqual(decoded, input)).toBe(true);
  }, 30_000);

  test("4 MiB の反復データを往復しても元のデータに戻る", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const input = new TextEncoder().encode("0123456789abcdef".repeat((4 * 1024 * 1024) / 16));

    // 実行：
    const decoded = await decode(target, await encode(target, input));

    // 検証：
    expect(bytesEqual(decoded, input)).toBe(true);
  }, 30_000);
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
});

describe("圧縮レベルの反映", () => {
  test("異なるレベルでは圧縮結果が異なる", async ({ expect, signal }) => {
    // 準備：
    // zstd の圧縮率は隣接レベル間で単調ではないため、サイズの大小ではなく出力の差異を検証する。
    const input = createLevelSensitiveInput();
    const low = new ZstdBun({ level: 1 });
    const high = new ZstdBun({ level: 19 });
    await low.open(createOpenContext({ signal }) as IMiddleware.OpenContext);
    await high.open(createOpenContext({ signal }) as IMiddleware.OpenContext);

    // 実行：
    const lowEncoded = await encode(low, input);
    const highEncoded = await encode(high, input);

    // 検証：
    expect(bytesEqual(lowEncoded, highEncoded)).toBe(false);
  });
});

describe("余剰キー", () => {
  test("コンテキストの余剰変数を付けても無視して往復できる", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const input = createPseudoRandomBytes(128, 14);

    // 実行：
    const encodeContext = createEncodeContext(input, "", { values: { extra: true } });
    await target.encode(encodeContext as ByteEncode, createNext());

    const decoded = await decode(target, encodeContext.destination);

    // 検証：
    expect(decoded).toStrictEqual(input);
  });
});

describe("ミドルウェア連鎖", () => {
  test("encode と decode は変換結果を設定してから next を1回呼ぶ", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const input = createPseudoRandomBytes(128, 61);
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

describe("zstd フレーム", () => {
  test("encode したデータは zstd のマジックバイトで始まる", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const input = createPseudoRandomBytes(512, 7);

    // 実行：
    const encoded = await encode(target, input);

    // 検証：
    // zstd マジック 0xFD2FB528 のリトルエンディアン先頭 4 バイトです。
    expect(Array.from(encoded.subarray(0, 4))).toStrictEqual([0x28, 0xb5, 0x2f, 0xfd]);
  });

  test("異なるレベルで圧縮したデータは互いに展開できる", async ({ expect, signal }) => {
    // 準備：
    const input = createPseudoRandomBytes(1024, 8);
    const low = new ZstdBun({ level: 1 });
    const high = new ZstdBun({ level: 22 });
    await low.open(createOpenContext({ signal }) as IMiddleware.OpenContext);
    await high.open(createOpenContext({ signal }) as IMiddleware.OpenContext);

    // 実行：
    const decodedLow = await decode(high, await encode(low, input));
    const decodedHigh = await decode(low, await encode(high, input));

    // 検証：
    expect(decodedLow).toStrictEqual(input);
    expect(decodedHigh).toStrictEqual(input);
  });
});

describe("他形式との非互換", () => {
  test("gzip データを decode するとエラーで拒否される", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const input = createPseudoRandomBytes(512, 9);
    const source = new CompressionStream("gzip");
    const reading = new Response(source.readable).arrayBuffer();
    const writer = source.writable.getWriter();

    // 実行：
    await writer.write(input);
    await writer.close();

    const gzipData = new Uint8Array(await reading);

    // 検証：
    // 実装は展開失敗を専用エラーで包まず上流エラーをそのまま伝搬するため、汎用エラーを検証する。
    await expect(decode(target, gzipData)).rejects.toThrow(Error);
  });

  test("壊れた圧縮データを decode するとエラーで拒否される", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const garbage = createPseudoRandomBytes(64, 21);

    // 実行と検証：
    await expect(decode(target, garbage)).rejects.toThrow(Error);
  });

  test("先頭を壊したデータを decode するとエラーで拒否される", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const encoded = await encode(target, createPseudoRandomBytes(4096, 23));
    const corrupted = encoded.slice();
    const firstByte = requireByte(corrupted[0]);
    corrupted[0] = firstByte ^ 0xff;

    // 実行と検証：
    await expect(decode(target, corrupted)).rejects.toThrow(Error);
  });
});

describe.skipIf(!hasBunZstd)("Bun との相互運用", () => {
  test("encode の出力を Bun.zstdDecompressSync で展開できる", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const input = createPseudoRandomBytes(1024, 15);
    const bun = requireBunZstd();

    // 実行：
    const encoded = await encode(target, input);
    const decompressSync = bun.zstdDecompressSync as (data: Uint8Array) => Uint8Array;
    const decompressed = decompressSync(encoded);

    // 検証：
    expect(new Uint8Array(decompressed)).toStrictEqual(input);
  });

  test("Bun.zstdCompressSync で圧縮したフレームを decode で展開できる", async ({
    expect,
    signal,
  }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const input = createPseudoRandomBytes(1024, 16);
    const bun = requireBunZstd();
    const compressSync = bun.zstdCompressSync as (data: Uint8Array) => Uint8Array;

    // 実行：
    const compressed = compressSync(input);
    const decoded = await decode(target, new Uint8Array(compressed));

    // 検証：
    expect(decoded).toStrictEqual(input);
  });
});

describe("空の入力の decode", () => {
  test("空のバイト列をエラーで拒否する", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);

    // 実行と検証：
    // Bun の zstd API は空の入力を空の展開結果として受け入れるため、破損データとの取り違えを防ぐ契約を検証する。
    await expect(decode(target, new Uint8Array(0))).rejects.toThrow(Error);
  });
});

describe.skipIf(!hasZstd)("node:zlib との相互運用", () => {
  test("node:zlib で圧縮したフレームを decode で展開できる", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const input = createPseudoRandomBytes(1024, 17);
    const compressed = zstdCompressSync(input);

    // 実行：
    const decoded = await decode(target, new Uint8Array(compressed));

    // 検証：
    expect(decoded).toStrictEqual(input);
  });

  test("encode の出力を node:zlib で展開できる", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const input = createPseudoRandomBytes(1024, 18);

    // 実行：
    const encoded = await encode(target, input);
    const decompressed = zstdDecompressSync(encoded);

    // 検証：
    expect(new Uint8Array(decompressed)).toStrictEqual(input);
  });

  test("チェックサム付きフレームを展開でき、改竄されたチェックサムを拒否する", async ({
    expect,
    signal,
  }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const input = createPseudoRandomBytes(1024, 19);
    const compressed = new Uint8Array(
      zstdCompressSync(input, {
        params: { [constants.ZSTD_c_checksumFlag]: 1 },
      }),
    );

    // 実行：
    const decoded = await decode(target, compressed);

    // 検証：
    expect(decoded).toStrictEqual(input);

    // 準備：
    const corrupted = compressed.slice();
    const last = corrupted.byteLength - 1;
    const lastByte = requireByte(corrupted[last]);
    corrupted[last] = lastByte ^ 0xff;

    // 実行と検証：
    // 展開器はチェックサムを検証するため、フレームの破損を成功として扱わない。
    await expect(decode(target, corrupted)).rejects.toThrow(Error);
  });
});

describe("インスタンスの状態", () => {
  test("初期状態で isOpen が false であり open 後に true になる", async ({ expect, signal }) => {
    // 準備：
    const target = new ZstdBun();
    const input = createPseudoRandomBytes(128, 31);

    // 実行：
    expect(target.isOpen).toBe(false);
    await target.open(createOpenContext({ signal }) as IMiddleware.OpenContext);

    const encoded = await encode(target, input);
    await decode(target, encoded);

    // 検証：
    expect(target.name).toBe("ZstdBun");
    expect(target.isOpen).toBe(true);
  });

  test("open を持ち close を持たない", async ({ expect, signal }) => {
    // 準備：
    const target = new ZstdBun();

    // 実行と検証：
    expect(target.isOpen).toBe(false);
    expect(typeof target.open).toBe("function");
    expect("close" in target).toBe(false);
    await target.open(createOpenContext({ signal }) as IMiddleware.OpenContext);
    expect(target.isOpen).toBe(true);
  });

  test("decode が失敗しても isOpen は true のままである", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const invalidData = new Uint8Array([0, 1, 2, 3]);

    // 実行と検証：
    await expect(decode(target, invalidData)).rejects.toThrow(Error);
    expect(target.isOpen).toBe(true);
  });

  test("open 前の encode と decode は TypeError で拒否される", async ({ expect }) => {
    // 準備：
    // 実装は open() で解決した実行環境を必須とするため、未 open の使用は TypeError になる。
    const target = new ZstdBun();
    const input = createPseudoRandomBytes(128, 37);

    // 実行と検証：
    expect(target.isOpen).toBe(false);
    await expect(encode(target, input)).rejects.toThrow(TypeError);
    await expect(decode(target, input)).rejects.toThrow(TypeError);
  });

  test("encode と decode は引数の data を変更しない", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const input = createPseudoRandomBytes(1024, 33);
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

describe("コンストラクターオプション", () => {
  test("空のオプションを渡しても往復できる", async ({ expect, signal }) => {
    // 準備：
    const options: ZstdBunOptions = {};
    const target = new ZstdBun(options);
    await target.open(createOpenContext({ signal }) as IMiddleware.OpenContext);

    const input = Uint8Array.from([0xfb, 0xff]);

    // 実行：
    const decoded = await decode(target, await encode(target, input));

    // 検証：
    expect(decoded).toStrictEqual(input);

    expect(target.name).toBe("ZstdBun");
  });

  test("level の既定は 3 であり明示 3 と等価である", async ({ expect, signal }) => {
    // 準備：
    // レベルに敏感なデータを使い、既定値が別のレベルに変わった場合も検出できるようにする。
    const input = createLevelSensitiveInput();
    const omittedTarget = new ZstdBun();
    const explicitTarget = new ZstdBun({ level: 3 });
    await omittedTarget.open(createOpenContext({ signal }) as IMiddleware.OpenContext);
    await explicitTarget.open(createOpenContext({ signal }) as IMiddleware.OpenContext);

    // 実行：
    const omitted = await encode(omittedTarget, input);
    const explicit = await encode(explicitTarget, input);

    // 検証：
    expect(bytesEqual(omitted, explicit)).toBe(true);
  });

  test("有効な境界 1 と 22 は受け付ける", ({ expect }) => {
    // 実行と検証：
    expect(() => new ZstdBun({ level: 1 })).not.toThrow();
    expect(() => new ZstdBun({ level: 22 })).not.toThrow();
  });

  test("無効値は ZstdBunInvalidLevelError で拒否する", ({ expect }) => {
    // 準備：
    const invalidValues = [
      0,
      23,
      -1,
      -7,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      "3",
      true,
      null,
    ];

    // 実行と検証：
    for (const value of invalidValues) {
      expect(
        () => new ZstdBun({ level: value as unknown as ZstdBunOptions["level"] }),
        String(value),
      ).toThrow(ZstdBunInvalidLevelError);
    }
  });

  test("meta.actual に指定値をそのまま保持する", ({ expect }) => {
    // 実行と検証：
    for (const value of [0, 23, -1, 1.5, Number.NaN, "3", true, null]) {
      const thrown = captureThrown(
        () => new ZstdBun({ level: value as unknown as ZstdBunOptions["level"] }),
      );
      expect(thrown).toBeInstanceOf(ZstdBunInvalidLevelError);
      expect((thrown as ZstdBunInvalidLevelError).meta).toStrictEqual({ actual: value });
    }
  });
});

describe("ZstdBunInvalidLevelError", () => {
  test("meta に actual を保持し、既定では英語メッセージを返す", ({ expect }) => {
    // 実行：
    const error = new ZstdBunInvalidLevelError({ actual: 0 });

    // 検証：
    expect(error).toBeInstanceOf(globalThis.Error);
    expect(error.name).toBe("UniKvsZstdBunInvalidLevelError");
    expect(error.meta).toStrictEqual({ actual: 0 });
    expect(error.message).toBe("Invalid zstd compression level: 0");
  });

  test("cause を保持する", ({ expect }) => {
    // 準備：
    const cause = new Error("原因");

    // 実行：
    const error = new ZstdBunInvalidLevelError({
      cause,
      actual: 0,
    });

    // 検証：
    expect(error.cause).toBe(cause);
  });

  test("言語設定が日本語なら日本語メッセージを返す", ({ expect }) => {
    // 準備：
    const error = new ZstdBunInvalidLevelError({ actual: 0 });

    try {
      // 実行：
      setGlobalConfig({ lang: "ja" });

      // 検証：
      expect(error.message).toBe("無効な zstd 圧縮レベル: 0");
    } finally {
      deleteGlobalConfig();
    }
  });
});

describe("index のエクスポート", () => {
  test("トランスフォーマーとエラーがエクスポートされている", ({ expect }) => {
    // 実行と検証：
    expect(index.ZstdBun).toBe(ZstdBun);
    expect(index.ZstdBunInvalidLevelError).toBe(ZstdBunInvalidLevelError);
    expect(index.UnsupportedRuntimeError).toBe(UnsupportedRuntimeError);
  });

  test("エラーの型が公開されている", () => {
    // 実行と検証：
    expectTypeOf<ZstdBunInvalidLevelErrorArgs>().toHaveProperty("actual");
    expectTypeOf<ZstdBunInvalidLevelErrorMeta>().toEqualTypeOf<{ readonly actual: unknown }>();
    expectTypeOf<UnsupportedRuntimeErrorArgs>().toHaveProperty("runtime");
    expectTypeOf<UnsupportedRuntimeErrorMeta>().toEqualTypeOf<{
      readonly name: string;
      readonly runtime: string;
    }>();
  });
});
