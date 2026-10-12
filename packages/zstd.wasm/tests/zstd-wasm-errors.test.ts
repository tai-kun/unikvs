import { captureRejection, createPseudoRandomBytes } from "@unikvs/testing";
import { describe, test as vitest, vi } from "vitest";

import { deleteGlobalConfig, setGlobalConfig } from "../../core/node_modules/valibot/dist/index.js";
import { ZstdWasmInitError, ZstdWasmInvalidLevelError } from "../src/errors.js";
import ZstdWasm, { type ZstdWasmOptions } from "../src/zstd-wasm.js";

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

// 上流モジュールの解決は open() 時に共有キャッシュで1回だけ実行されるため、
// 解決失敗の検証はモジュールを再読み込みした新鮮な実体で行う。
// 静的 import の実体とはキャッシュを共有しないため、後続の往復群に影響しない。
describe("WASM 初期化の失敗", () => {
  test("初期化失敗時は open を ZstdWasmInitError で拒否する", async ({ expect, signal }) => {
    // 準備
    vi.resetModules();

    try {
      const fresh = await import("../src/zstd-wasm.js");
      const freshErrors = await import("../src/errors.js");
      const freshCore = await import("../src/_core.js");
      const cause = new Error("init failure");
      const initSpy = vi.spyOn(freshCore.api, "init").mockRejectedValueOnce(cause);
      const target = new fresh.default();

      try {
        // 実行
        const error = await captureRejection(target.open({ signal }));

        // 検証
        // 失敗は ZstdWasmInitError で包み、原因を保持する。
        expect(error).toBeInstanceOf(freshErrors.ZstdWasmInitError);
        expect(
          (error as InstanceType<typeof freshErrors.ZstdWasmInitError>).cause,
        ).toBe(cause);
        expect(target.isOpen).toBe(false);

        // 実行と検証
        // 失敗はキャッシュされないため、再試行では解決が再実行される。
        await target.open({ signal });
        const input = createPseudoRandomBytes(64, 41);
        const decoded = await target.decode({ data: await target.encode({ data: input }) });
        expect(decoded).toStrictEqual(input);
        expect(target.isOpen).toBe(true);
        expect(initSpy).toHaveBeenCalledTimes(2);
      } finally {
        initSpy.mockRestore();
      }
    } finally {
      vi.restoreAllMocks();
    }
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
  test("圧縮データではないバイト列をエラーで拒否する", async ({ expect, signal }) => {
    // 準備
    const target = new ZstdWasm();
    await target.open({ signal });
    const garbage = createPseudoRandomBytes(64, 21);

    // 実行と検証
    // 実装は展開失敗を専用エラーで包まず上流エラーをそのまま伝搬するため、汎用エラーを検証する。
    await expect(target.decode({ data: garbage })).rejects.toThrow(Error);
  });

  test("末尾を欠いたデータをエラーで拒否する", async ({ expect, signal }) => {
    // 準備
    const target = new ZstdWasm();
    await target.open({ signal });
    const encoded = await target.encode({ data: createPseudoRandomBytes(4096, 22) });

    // 実行と検証
    await expect(target.decode({ data: encoded.subarray(0, encoded.length - 4) })).rejects.toThrow(
      Error,
    );
  });

  test("先頭を壊したデータをエラーで拒否する", async ({ expect, signal }) => {
    // 準備
    // 末尾破壊は検出できない場合があるため、先頭のマジックバイトを壊して検証する。
    const target = new ZstdWasm();
    await target.open({ signal });
    const encoded = await target.encode({ data: createPseudoRandomBytes(4096, 23) });
    const corrupted = encoded.slice();
    corrupted[0] = corrupted[0]! ^ 0xff;

    // 実行と検証
    await expect(target.decode({ data: corrupted })).rejects.toThrow(Error);
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
    // null は既定値に吸収されず無効値として拒否される。
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
        () => new ZstdWasm({ level: value as unknown as ZstdWasmOptions["level"] }),
        `${String(value)}`,
      ).toThrow(ZstdWasmInvalidLevelError);
    }
  });

  test("meta.actual に指定値をそのまま保持する", ({ expect }) => {
    // 実行と検証
    // 拒否区分の全 10 値で指定値そのまま保持の契約を検証する。
    for (const value of [
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
    ]) {
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
