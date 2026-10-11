import { createPseudoRandomBytes } from "@unikvs/testings";
import { describe, test as vitest, vi } from "vitest";

import { deleteGlobalConfig, setGlobalConfig } from "../../core/node_modules/valibot/dist/index.js";
import { wasmBridge } from "../src/_zstd-wasm.js";
import {
  ZstdWasmDecompressError,
  ZstdWasmInitError,
  ZstdWasmInvalidLevelError,
} from "../src/errors.js";
import ZstdWasm, { type ZstdWasmOptions } from "../src/zstd-wasm.js";

/**
 * 中断されていないシグナルを作成します。
 */
function createSignal(): AbortSignal {
  return new AbortController().signal;
}

/**
 * 言語設定をテスト内でのみ変更するためのフィクスチャーです。
 * 設定した言語はテスト終了後に削除され、ほかのテストに影響しません。
 *
 * valibot は zstd の直接依存ではないため、@unikvs/core が使う実体を
 * 明示的に参照しています。ブラウザーでは読み込まれるモジュール実体が
 * 分かれるため、日本語メッセージの検証はサーバーでのみ行います。
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

describe("WASM 初期化の失敗", () => {
  test("初期化失敗時は open を ZstdWasmInitError で拒否する", async ({ expect }) => {
    // 準備
    // ファイル内では最初の初期化のため、共有キャッシュは未登録である。
    const initSpy = vi.spyOn(wasmBridge, "init").mockRejectedValueOnce(new Error("init failure"));

    try {
      const target = new ZstdWasm();

      // 実行と検証
      await expect(target.open({ signal: createSignal() })).rejects.toThrow(ZstdWasmInitError);
      expect(target.isOpen).toBe(false);
      expect(initSpy).toHaveBeenCalledTimes(1);
    } finally {
      initSpy.mockRestore();
    }
  });
});

describe("ZstdWasmDecompressError", () => {
  test("既定では英語メッセージを返す", ({ expect }) => {
    // 実行
    const error = new ZstdWasmDecompressError();

    // 検証
    expect(error).toBeInstanceOf(globalThis.Error);
    expect(error.name).toBe("UniKvsZstdWasmDecompressError");
    expect(error.meta).toBeUndefined();
    expect(error.message).toBe("Failed to decompress the zstd data");
  });

  test("cause を保持する", ({ expect }) => {
    // 準備
    const cause = new Error("原因");

    // 実行
    const error = new ZstdWasmDecompressError({ cause });

    // 検証
    expect(error.cause).toBe(cause);
  });

  test.skipIf(__CLIENT__)("言語設定が日本語なら日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備
    const error = new ZstdWasmDecompressError();

    // 実行
    setLang("ja");

    // 検証
    expect(error.message).toBe("zstd データの展開に失敗しました");
  });
});

describe("ZstdWasmInitError", () => {
  test("既定では英語メッセージを返す", ({ expect }) => {
    // 実行
    const error = new ZstdWasmInitError();

    // 検証
    expect(error).toBeInstanceOf(globalThis.Error);
    expect(error.name).toBe("UniKvsZstdWasmInitError");
    expect(error.meta).toBeUndefined();
    expect(error.message).toBe("Failed to initialize the zstd module");
  });

  test("cause を保持する", ({ expect }) => {
    // 準備
    const cause = new Error("原因");

    // 実行
    const error = new ZstdWasmInitError({ cause });

    // 検証
    expect(error.cause).toBe(cause);
  });

  test.skipIf(__CLIENT__)("言語設定が日本語なら日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備
    const error = new ZstdWasmInitError();

    // 実行
    setLang("ja");

    // 検証
    expect(error.message).toBe("zstd モジュールの初期化に失敗しました");
  });
});

describe("ZstdWasmInvalidLevelError", () => {
  test("meta に actual を保持し、既定では英語メッセージを返す", ({ expect }) => {
    // 実行
    const error = new ZstdWasmInvalidLevelError({ actual: 0 });

    // 検証
    expect(error).toBeInstanceOf(globalThis.Error);
    expect(error.name).toBe("UniKvsZstdWasmInvalidLevelError");
    expect(error.meta).toStrictEqual({ actual: 0 });
    expect(error.message).toBe("Invalid zstd compression level: 0");
  });

  test("cause を保持する", ({ expect }) => {
    // 準備
    const cause = new Error("原因");

    // 実行
    const error = new ZstdWasmInvalidLevelError({ actual: 0, cause });

    // 検証
    expect(error.cause).toBe(cause);
  });

  test.skipIf(__CLIENT__)("言語設定が日本語なら日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備
    const error = new ZstdWasmInvalidLevelError({ actual: 0 });

    // 実行
    setLang("ja");

    // 検証
    expect(error.message).toBe("無効な zstd 圧縮レベル: 0");
  });
});

describe("壊れた圧縮データの decode", () => {
  test("圧縮データではないバイト列を ZstdWasmDecompressError で拒否する", async ({ expect }) => {
    // 準備
    const target = new ZstdWasm();
    await target.open({ signal: createSignal() });
    const garbage = createPseudoRandomBytes(64, 21);

    // 実行と検証
    await expect(target.decode({ data: garbage })).rejects.toThrow(ZstdWasmDecompressError);
  });

  test("末尾を欠いたデータを ZstdWasmDecompressError で拒否する", async ({ expect }) => {
    // 準備
    const target = new ZstdWasm();
    await target.open({ signal: createSignal() });
    const encoded = await target.encode({ data: createPseudoRandomBytes(4096, 22) });

    // 実行と検証
    await expect(target.decode({ data: encoded.subarray(0, encoded.length - 4) })).rejects.toThrow(
      ZstdWasmDecompressError,
    );
  });

  test("先頭を壊したデータを ZstdWasmDecompressError で拒否する", async ({ expect }) => {
    // 準備
    // 末尾破壊は検出できない場合があるため、先頭のマジックバイトを壊して検証する。
    const target = new ZstdWasm();
    await target.open({ signal: createSignal() });
    const encoded = await target.encode({ data: createPseudoRandomBytes(4096, 23) });
    const corrupted = encoded.slice();
    corrupted[0] = corrupted[0]! ^ 0xff;

    // 実行と検証
    await expect(target.decode({ data: corrupted })).rejects.toThrow(ZstdWasmDecompressError);
  });
});

describe("範囲外レベルのコンストラクター", () => {
  test("有効な境界 1 と 22 は受け付ける", ({ expect }) => {
    // 実行と検証
    expect(() => new ZstdWasm({ level: 1 })).not.toThrow();
    expect(() => new ZstdWasm({ level: 22 })).not.toThrow();
  });

  test("無効値は ZstdWasmInvalidLevelError で拒否する", ({ expect }) => {
    // 準備
    // 本ループは拒否区分のみを扱う。有効区分は往復群とオプション節で検証する。
    const invalidValues = [0, 23, -1, -7, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "3", true];

    // 実行と検証
    for (const value of invalidValues) {
      expect(
        () => new ZstdWasm({ level: value as unknown as ZstdWasmOptions["level"] }),
        `${String(value)}`,
      ).toThrow(ZstdWasmInvalidLevelError);
    }
  });

  test("meta.actual に指定値をそのまま保持する", ({ expect }) => {
    // 実行と検証
    // 拒否区分の全 9 値で指定値そのまま保持の契約を検証する。
    for (const value of [0, 23, -1, -7, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "3", true]) {
      let thrown: unknown;

      try {
        new ZstdWasm({ level: value as unknown as ZstdWasmOptions["level"] });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(ZstdWasmInvalidLevelError);
      expect((thrown as ZstdWasmInvalidLevelError).meta).toStrictEqual({ actual: value });
    }
  });
});
