import type { IMiddleware } from "@unikvs/core";
import {
  abortedSignal,
  createDecodeContext,
  createEncodeContext,
  createNext,
  createOpenContext,
  createPseudoRandomBytes,
} from "@unikvs/testing";
import { deleteGlobalConfig, setGlobalConfig } from "valibot";
import { describe, test as vitest } from "vitest";

import { api, type IEnv } from "../src/_core.js";
import BrotliWasm, { type BrotliWasmOptions } from "../src/brotli-wasm.js";
import { BrotliWasmInitError, BrotliWasmInvalidLevelError } from "../src/errors.js";

/**
 * 言語設定をテスト内でのみ変更するためのフィクスチャーです。
 * 設定した言語はテスト終了後に削除され、ほかのテストに影響しません。
 *
 * valibot は brotli.wasm の直接依存ではないため、@unikvs/core が使う実体を
 * 明示的に参照しています。
 */
const test = vitest.extend<{
  setLang: (lang: string) => void;
}>({
  // oxlint-disable-next-line no-empty-pattern
  async setLang({}, use) {
    await use((lang) => {
      setGlobalConfig({ lang });
    });
    deleteGlobalConfig();
  },
});

/**
 * ターゲットを開きます。
 */
async function openTarget(target: BrotliWasm, signal: AbortSignal): Promise<void> {
  await target.open(createOpenContext({ signal }) as IMiddleware.OpenContext);
}

/**
 * バイト列を圧縮して返します。
 */
async function encode(
  target: BrotliWasm,
  data: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const c = createEncodeContext(data);
  await target.encode(
    c as IMiddleware.EncodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
    createNext(),
  );

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
  await target.decode(
    c as IMiddleware.DecodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
    createNext(),
  );

  return c.destination;
}

describe("BrotliWasmInitError", () => {
  test("meta に undefined を保持し、既定では英語メッセージを返す", ({ expect }) => {
    // 実行
    const error = new BrotliWasmInitError();

    // 検証
    expect(error).toBeInstanceOf(globalThis.Error);
    expect(error.name).toBe("UniKvsBrotliWasmInitError");
    expect(error.meta).toBeUndefined();
    expect(error.message).toBe("Failed to initialize the brotli module");
  });

  test("cause を保持する", ({ expect }) => {
    // 準備
    const cause = new Error("原因");

    // 実行
    const error = new BrotliWasmInitError({ cause });

    // 検証
    expect(error.cause).toBe(cause);
  });

  test("言語設定が日本語なら日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備
    const error = new BrotliWasmInitError();

    // 実行
    setLang("ja");

    // 検証
    expect(error.message).toBe("brotli モジュールの初期化に失敗しました");
  });
});

describe("BrotliWasmInvalidLevelError", () => {
  test("meta に actual を保持し、既定では英語メッセージを返す", ({ expect }) => {
    // 実行
    const error = new BrotliWasmInvalidLevelError({ actual: 12 });

    // 検証
    expect(error).toBeInstanceOf(globalThis.Error);
    expect(error.name).toBe("UniKvsBrotliWasmInvalidLevelError");
    expect(error.meta).toStrictEqual({ actual: 12 });
    expect(error.message).toBe("Invalid brotli compression level: 12");
  });

  test("cause を保持する", ({ expect }) => {
    // 準備
    const cause = new Error("原因");

    // 実行
    const error = new BrotliWasmInvalidLevelError({ actual: 12, cause });

    // 検証
    expect(error.cause).toBe(cause);
  });

  test("言語設定が日本語なら日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備
    const error = new BrotliWasmInvalidLevelError({ actual: 12 });

    // 実行
    setLang("ja");

    // 検証
    expect(error.message).toBe("無効な brotli 圧縮レベル: 12");
  });
});

describe("壊れた圧縮データの decode", () => {
  test("圧縮データではないバイト列をエラーで拒否する", async ({ expect, signal }) => {
    // 準備
    const target = new BrotliWasm();
    await openTarget(target, signal);
    const garbage = createPseudoRandomBytes(64, 21);

    // 実行と検証
    // 実装は展開失敗を専用エラーで包まず上流エラーを Error へ正規化して伝搬するため、汎用エラーを検証する。
    await expect(decode(target, garbage)).rejects.toThrow(Error);
  });

  test("末尾を欠いたデータをエラーで拒否する", async ({ expect, signal }) => {
    // 準備
    const target = new BrotliWasm();
    await openTarget(target, signal);
    const encoded = await encode(target, createPseudoRandomBytes(4096, 22));

    // 実行と検証
    await expect(decode(target, encoded.subarray(0, encoded.length - 4))).rejects.toThrow(Error);
  });

  test("先頭を壊したデータをエラーで拒否する", async ({ expect, signal }) => {
    // 準備
    const target = new BrotliWasm();
    await openTarget(target, signal);
    const encoded = await encode(target, createPseudoRandomBytes(4096, 23));
    const corrupted = encoded.slice();
    corrupted[0] = corrupted[0]! ^ 0xff;

    // 実行と検証
    await expect(decode(target, corrupted)).rejects.toThrow(Error);
  });

  test("decode が失敗しても isOpen は true のままである", async ({ expect, signal }) => {
    // 準備
    const target = new BrotliWasm();
    await openTarget(target, signal);
    const invalidData = new Uint8Array([0, 1, 2, 3]);

    // 実行と検証
    await expect(decode(target, invalidData)).rejects.toThrow(Error);
    expect(target.isOpen).toBe(true);
  });
});

describe("上流エラーの正規化", () => {
  test("Error インスタンスはそのまま伝播する", ({ expect }) => {
    // 準備
    // 上流は文字列などの非 Error 値を送出する場合があるため、包み直しの有無を検証する。
    const cause = new Error("upstream failure");
    const env = {
      compress: () => {
        throw cause;
      },
      decompress: () => {
        throw cause;
      },
    } as unknown as IEnv;
    const input = new Uint8Array([1, 2, 3]);

    // 実行と検証
    let compressThrown: unknown;
    try {
      api.compress(env, input, { level: 11 });
    } catch (error) {
      compressThrown = error;
    }
    expect(compressThrown).toBe(cause);

    let decompressThrown: unknown;
    try {
      api.decompress(env, input);
    } catch (error) {
      decompressThrown = error;
    }
    expect(decompressThrown).toBe(cause);
  });

  test("文字列の送出は Error へ包んで伝播する", ({ expect }) => {
    // 準備
    const env = {
      compress: () => {
        throw "Options is not an object";
      },
      decompress: () => {
        throw "Brotli decompress failed";
      },
    } as unknown as IEnv;
    const input = new Uint8Array([1, 2, 3]);

    // 実行と検証
    let compressThrown: unknown;
    try {
      api.compress(env, input, { level: 11 });
    } catch (error) {
      compressThrown = error;
    }
    expect(compressThrown).toBeInstanceOf(Error);
    expect((compressThrown as Error).message).toBe("Options is not an object");

    let decompressThrown: unknown;
    try {
      api.decompress(env, input);
    } catch (error) {
      decompressThrown = error;
    }
    expect(decompressThrown).toBeInstanceOf(Error);
    expect((decompressThrown as Error).message).toBe("Brotli decompress failed");
  });
});

describe("範囲外レベルのコンストラクター", () => {
  test("有効な境界 0 と 11 は受け付ける", ({ expect }) => {
    // 実行と検証
    expect(() => new BrotliWasm({ level: 0 })).not.toThrow();
    expect(() => new BrotliWasm({ level: 11 })).not.toThrow();
  });

  test("無効値は BrotliWasmInvalidLevelError で拒否する", ({ expect }) => {
    // 準備
    // 本ループは拒否区分のみを扱う。有効区分は往復群とオプション節で検証する。
    // null は既定値に吸収されず無効値として拒否される。
    const invalidValues = [
      -1,
      -7,
      12,
      22,
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
        () => new BrotliWasm({ level: value as unknown as BrotliWasmOptions["level"] }),
        `${String(value)}`,
      ).toThrow(BrotliWasmInvalidLevelError);
    }
  });

  test("meta.actual に指定値をそのまま保持する", ({ expect }) => {
    // 実行と検証
    // 拒否区分の全 10 値で指定値そのまま保持の契約を検証する。
    for (const value of [
      -1,
      -7,
      12,
      22,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      "3",
      true,
      null,
    ]) {
      let thrown: unknown;

      try {
        new BrotliWasm({ level: value as unknown as BrotliWasmOptions["level"] });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(BrotliWasmInvalidLevelError);
      expect((thrown as BrotliWasmInvalidLevelError).meta).toStrictEqual({ actual: value });
    }
  });
});

describe("open 前の使用", () => {
  test("open 前の encode と decode は TypeError で拒否される", async ({ expect }) => {
    // 準備
    // 実装は open() で解決した実行環境を必須とするため、未 open の使用は TypeError になる。
    const target = new BrotliWasm();
    const input = createPseudoRandomBytes(128, 31);

    // 実行と検証
    expect(target.isOpen).toBe(false);
    await expect(encode(target, input)).rejects.toThrow(TypeError);
    await expect(decode(target, input)).rejects.toThrow(TypeError);
  });
});

describe("open の中断", () => {
  test("開済み状態での中断済み open は拒否するが isOpen は true のままである", async ({
    expect,
    signal,
  }) => {
    // 準備
    const target = new BrotliWasm();
    await openTarget(target, signal);
    const input = createPseudoRandomBytes(64, 34);

    // 実行と検証
    await expect(
      target.open(createOpenContext({ signal: abortedSignal() }) as IMiddleware.OpenContext),
    ).rejects.toBeInstanceOf(DOMException);
    expect(target.isOpen).toBe(true);

    // 実行と検証
    // 既存の実行環境は破棄されないため、引き続き往復できる。
    const decoded = await decode(target, await encode(target, input));
    expect(decoded).toStrictEqual(input);
  });
});
