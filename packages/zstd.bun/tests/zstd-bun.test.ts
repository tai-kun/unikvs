import { zstdCompressSync, zstdDecompressSync } from "node:zlib";

import type { IMiddleware } from "@unikvs/core";
import {
  bytesEqual,
  createDecodeContext,
  createEncodeContext,
  createNext,
  createOpenContext,
  createPseudoRandomBytes,
} from "@unikvs/testing";
import { deleteGlobalConfig, setGlobalConfig } from "valibot";
import { describe, expectTypeOf, test } from "vitest";

import { UnsupportedRuntimeError, ZstdBunInvalidLevelError } from "../src/errors.js";
import * as index from "../src/index.js";
import type {
  UnsupportedRuntimeErrorArgs,
  UnsupportedRuntimeErrorMeta,
  ZstdBunInvalidLevelErrorArgs,
  ZstdBunInvalidLevelErrorMeta,
} from "../src/index.js";
import ZstdBun, { type ZstdBunOptions } from "../src/zstd-bun.js";

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
 * Bun の zstd API を解決します。
 */
function resolveBunZstd(): typeof Bun | undefined {
  // `Bun` は @types/bun により宣言されているため、typeof による判定は安全です。
  if (typeof Bun === "undefined") {
    return undefined;
  }

  if (typeof Bun.zstdCompressSync !== "function") {
    return undefined;
  }

  if (typeof Bun.zstdDecompressSync !== "function") {
    return undefined;
  }

  return Bun;
}

const bunZstd = resolveBunZstd();
const hasBunZstd = bunZstd !== undefined;

// node:zlib の zstd 系 API が利用できない Node 版では当該 2 件をスキップする。
const hasZstd = typeof zstdCompressSync === "function" && typeof zstdDecompressSync === "function";

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
      const target = new ZstdBun({ level });
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

describe("zstd フレーム", () => {
  test("encode したデータは zstd のマジックバイトで始まる", async ({ expect, signal }) => {
    // 準備
    const target = await createOpenedTarget(signal);
    const input = createPseudoRandomBytes(512, 7);

    // 実行
    const encoded = await encode(target, input);

    // 検証
    // zstd マジック 0xFD2FB528 のリトルエンディアン先頭 4 バイトです。
    expect(Array.from(encoded.subarray(0, 4))).toStrictEqual([0x28, 0xb5, 0x2f, 0xfd]);
  });

  test("異なるレベルで圧縮したデータは互いに展開できる", async ({ expect, signal }) => {
    // 準備
    const input = createPseudoRandomBytes(1024, 8);
    const low = new ZstdBun({ level: 1 });
    const high = new ZstdBun({ level: 22 });
    await low.open(createOpenContext({ signal }) as IMiddleware.OpenContext);
    await high.open(createOpenContext({ signal }) as IMiddleware.OpenContext);

    // 実行
    const decodedLow = await decode(high, await encode(low, input));
    const decodedHigh = await decode(low, await encode(high, input));

    // 検証
    expect(decodedLow).toStrictEqual(input);
    expect(decodedHigh).toStrictEqual(input);
  });
});

describe("他形式との非互換", () => {
  test("gzip データを decode するとエラーで拒否される", async ({ expect, signal }) => {
    // 準備
    const target = await createOpenedTarget(signal);
    const input = createPseudoRandomBytes(512, 9);
    const source = new CompressionStream("gzip");
    const reading = new Response(source.readable).arrayBuffer();
    const writer = source.writable.getWriter();

    // 実行
    await writer.write(input);
    await writer.close();
    const gzipData = new Uint8Array(await reading);

    // 検証
    // 実装は展開失敗を専用エラーで包まず上流エラーをそのまま伝搬するため、汎用エラーを検証する。
    await expect(decode(target, gzipData)).rejects.toThrow(Error);
  });

  test("壊れた圧縮データを decode するとエラーで拒否される", async ({ expect, signal }) => {
    // 準備
    const target = await createOpenedTarget(signal);
    const garbage = createPseudoRandomBytes(64, 21);

    // 実行と検証
    await expect(decode(target, garbage)).rejects.toThrow(Error);
  });

  test("先頭を壊したデータを decode するとエラーで拒否される", async ({ expect, signal }) => {
    // 準備
    const target = await createOpenedTarget(signal);
    const encoded = await encode(target, createPseudoRandomBytes(4096, 23));
    const corrupted = encoded.slice();
    corrupted[0] = corrupted[0]! ^ 0xff;

    // 実行と検証
    await expect(decode(target, corrupted)).rejects.toThrow(Error);
  });
});

describe.skipIf(!hasBunZstd)("Bun との相互運用", () => {
  test("encode の出力を Bun.zstdDecompressSync で展開できる", async ({ expect, signal }) => {
    // 準備
    const target = await createOpenedTarget(signal);
    const input = createPseudoRandomBytes(1024, 15);

    // 実行
    const encoded = await encode(target, input);
    const decompressed = bunZstd!.zstdDecompressSync(encoded);

    // 検証
    expect(new Uint8Array(decompressed)).toStrictEqual(input);
  });

  test("Bun.zstdCompressSync で圧縮したフレームを decode で展開できる", async ({
    expect,
    signal,
  }) => {
    // 準備
    const target = await createOpenedTarget(signal);
    const input = createPseudoRandomBytes(1024, 16);

    // 実行
    const compressed = bunZstd!.zstdCompressSync(input);
    const decoded = await decode(target, new Uint8Array(compressed));

    // 検証
    expect(decoded).toStrictEqual(input);
  });
});

describe.skipIf(!hasZstd)("node:zlib との相互運用", () => {
  test("node:zlib で圧縮したフレームを decode で展開できる", async ({ expect, signal }) => {
    // 準備
    const target = await createOpenedTarget(signal);
    const input = createPseudoRandomBytes(1024, 17);
    const compressed = zstdCompressSync(input);

    // 実行
    const decoded = await decode(target, new Uint8Array(compressed));

    // 検証
    expect(decoded).toStrictEqual(input);
  });

  test("encode の出力を node:zlib で展開できる", async ({ expect, signal }) => {
    // 準備
    const target = await createOpenedTarget(signal);
    const input = createPseudoRandomBytes(1024, 18);

    // 実行
    const encoded = await encode(target, input);
    const decompressed = zstdDecompressSync(encoded);

    // 検証
    expect(new Uint8Array(decompressed)).toStrictEqual(input);
  });
});

describe("インスタンスの状態", () => {
  test("初期状態で isOpen が false であり open 後に true になる", async ({ expect, signal }) => {
    // 準備
    const target = new ZstdBun();
    const input = createPseudoRandomBytes(128, 31);

    // 実行
    expect(target.isOpen).toBe(false);
    await target.open(createOpenContext({ signal }) as IMiddleware.OpenContext);
    const encoded = await encode(target, input);
    await decode(target, encoded);

    // 検証
    expect(target.name).toBe("ZstdBun");
    expect(target.isOpen).toBe(true);
  });

  test("open を持ち close を持たない", async ({ expect, signal }) => {
    // 準備
    const target = new ZstdBun();

    // 実行と検証
    expect(target.isOpen).toBe(false);
    expect(typeof target.open).toBe("function");
    expect("close" in target).toBe(false);

    await target.open(createOpenContext({ signal }) as IMiddleware.OpenContext);
    expect(target.isOpen).toBe(true);
  });

  test("decode が失敗しても isOpen は true のままである", async ({ expect, signal }) => {
    // 準備
    const target = await createOpenedTarget(signal);
    const invalidData = new Uint8Array([0, 1, 2, 3]);

    // 実行と検証
    await expect(decode(target, invalidData)).rejects.toThrow(Error);
    expect(target.isOpen).toBe(true);
  });

  test("open 前の encode と decode は TypeError で拒否される", async ({ expect }) => {
    // 準備
    // 実装は open() で解決した実行環境を必須とするため、未 open の使用は TypeError になる。
    const target = new ZstdBun();
    const input = createPseudoRandomBytes(128, 37);

    // 実行と検証
    expect(target.isOpen).toBe(false);
    await expect(encode(target, input)).rejects.toThrow(TypeError);
    await expect(decode(target, input)).rejects.toThrow(TypeError);
  });

  test("encode と decode は引数の data を変更しない", async ({ expect, signal }) => {
    // 準備
    const target = await createOpenedTarget(signal);
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

describe("コンストラクターオプション", () => {
  test("空のオプションでは既定と等価に往復できる", async ({ expect, signal }) => {
    // 準備
    const options: ZstdBunOptions = {};
    const target = new ZstdBun(options);
    await target.open(createOpenContext({ signal }) as IMiddleware.OpenContext);
    const input = Uint8Array.from([0xfb, 0xff]);

    // 実行
    const decoded = await decode(target, await encode(target, input));

    // 検証
    expect(decoded).toStrictEqual(input);
    expect(target.name).toBe("ZstdBun");
  });

  test("level の既定は 3 であり明示 3 と等価である", async ({ expect, signal }) => {
    // 準備
    const input = Uint8Array.from([0x66, 0x6f, 0x6f, 0x62, 0x61, 0x72]);
    const omittedTarget = new ZstdBun();
    const explicitTarget = new ZstdBun({ level: 3 });
    await omittedTarget.open(createOpenContext({ signal }) as IMiddleware.OpenContext);
    await explicitTarget.open(createOpenContext({ signal }) as IMiddleware.OpenContext);

    // 実行
    const omitted = await encode(omittedTarget, input);
    const explicit = await encode(explicitTarget, input);

    // 検証
    expect(bytesEqual(omitted, explicit)).toBe(true);
  });

  test("level に null を明示すると ZstdBunInvalidLevelError で拒否する", ({ expect }) => {
    // 実行と検証
    // 実装は規定値への吸収に null を含めず、無効値として拒否する。
    expect(
      () =>
        new ZstdBun({
          level: null as unknown as ZstdBunOptions["level"],
        }),
    ).toThrow(ZstdBunInvalidLevelError);
  });

  test("有効な境界 1 と 22 は受け付ける", ({ expect }) => {
    // 実行と検証
    expect(() => new ZstdBun({ level: 1 })).not.toThrow();
    expect(() => new ZstdBun({ level: 22 })).not.toThrow();
  });

  test("無効値は ZstdBunInvalidLevelError で拒否する", ({ expect }) => {
    // 準備
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

    // 実行と検証
    for (const value of invalidValues) {
      expect(
        () => new ZstdBun({ level: value as unknown as ZstdBunOptions["level"] }),
        `${String(value)}`,
      ).toThrow(ZstdBunInvalidLevelError);
    }
  });

  test("meta.actual に指定値をそのまま保持する", ({ expect }) => {
    // 実行と検証
    for (const value of [0, 23, -1, 1.5, Number.NaN, "3", true, null]) {
      let thrown: unknown;

      try {
        new ZstdBun({ level: value as unknown as ZstdBunOptions["level"] });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(ZstdBunInvalidLevelError);
      expect((thrown as ZstdBunInvalidLevelError).meta).toStrictEqual({ actual: value });
    }
  });
});

describe("ZstdBunInvalidLevelError", () => {
  test("meta に actual を保持し、既定では英語メッセージを返す", ({ expect }) => {
    // 実行
    const error = new ZstdBunInvalidLevelError({ actual: 0 });

    // 検証
    expect(error).toBeInstanceOf(globalThis.Error);
    expect(error.name).toBe("UniKvsZstdBunInvalidLevelError");
    expect(error.meta).toStrictEqual({ actual: 0 });
    expect(error.message).toBe("Invalid zstd compression level: 0");
  });

  test("cause を保持する", ({ expect }) => {
    // 準備
    const cause = new Error("原因");

    // 実行
    const error = new ZstdBunInvalidLevelError({ actual: 0, cause });

    // 検証
    expect(error.cause).toBe(cause);
  });

  test("言語設定が日本語なら日本語メッセージを返す", ({ expect }) => {
    // 準備
    const error = new ZstdBunInvalidLevelError({ actual: 0 });

    try {
      // 実行
      setGlobalConfig({ lang: "ja" });

      // 検証
      expect(error.message).toBe("無効な zstd 圧縮レベル: 0");
    } finally {
      deleteGlobalConfig();
    }
  });
});

describe("UnsupportedRuntimeError", () => {
  test("既定では英語メッセージを返す", ({ expect }) => {
    // 実行
    const error = new UnsupportedRuntimeError({ name: "ZstdBun", runtime: "Bun" });

    // 検証
    expect(error).toBeInstanceOf(globalThis.Error);
    expect(error.name).toBe("UniKvsUnsupportedRuntimeError");
    expect(error.meta).toStrictEqual({ name: "ZstdBun", runtime: "Bun" });
    expect(error.message).toBe("ZstdBun can only be used in the Bun runtime");
  });

  test("cause を保持する", ({ expect }) => {
    // 準備
    const cause = new Error("原因");

    // 実行
    const error = new UnsupportedRuntimeError({ name: "ZstdBun", runtime: "Bun", cause });

    // 検証
    expect(error.cause).toBe(cause);
  });

  test("言語設定が日本語なら日本語メッセージを返す", ({ expect }) => {
    // 準備
    const error = new UnsupportedRuntimeError({ name: "ZstdBun", runtime: "Bun" });

    try {
      // 実行
      setGlobalConfig({ lang: "ja" });

      // 検証
      expect(error.message).toBe("ZstdBun は Bun ランタイムでのみ使用できます");
    } finally {
      deleteGlobalConfig();
    }
  });
});

describe("index のエクスポート", () => {
  test("トランスフォーマーとエラーがエクスポートされている", ({ expect }) => {
    // 実行と検証
    expect(index.ZstdBun).toBe(ZstdBun);
    expect(index.ZstdBunInvalidLevelError).toBe(ZstdBunInvalidLevelError);
    expect(index.UnsupportedRuntimeError).toBe(UnsupportedRuntimeError);
    // 実装は展開失敗を専用エラーで包まないため、ZstdBunDecompressError は公開しない。
    expect("ZstdBunDecompressError" in index).toBe(false);
  });

  test("エラーの型が公開されている", ({ expect }) => {
    // 準備
    const args: ZstdBunInvalidLevelErrorArgs = { actual: 0 };
    const meta: ZstdBunInvalidLevelErrorMeta = { actual: 0 };
    const runtimeArgs: UnsupportedRuntimeErrorArgs = { name: "ZstdBun", runtime: "Bun" };
    const runtimeMeta: UnsupportedRuntimeErrorMeta = { name: "ZstdBun", runtime: "Bun" };

    // 実行と検証
    expect(args.actual).toBe(0);
    expect(meta.actual).toBe(0);
    expect(runtimeArgs.name).toBe("ZstdBun");
    expect(runtimeMeta.runtime).toBe("Bun");
    expectTypeOf<ZstdBunInvalidLevelErrorArgs>().toHaveProperty("actual");
    expectTypeOf<ZstdBunInvalidLevelErrorMeta>().toEqualTypeOf<{ readonly actual: unknown }>();
  });

  test("存在しないエラーの型は公開されていない", () => {
    // @ts-expect-error ZstdBunDecompressError に対応する Args 型は存在しない。
    expectTypeOf<index.ZstdBunDecompressErrorArgs>().toBeNever();
  });
});
