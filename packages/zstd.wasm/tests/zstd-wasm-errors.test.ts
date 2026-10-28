import type { IMiddleware } from "@unikvs/core";
import {
  createNext,
  captureThrown,
  captureRejection,
  createOpenContext,
  createDecodeContext,
  createEncodeContext,
  createPseudoRandomBytes,
} from "@unikvs/testing";
import { setGlobalConfig, deleteGlobalConfig } from "valibot";
import { vi, test as vitest, describe } from "vite-plus/test";

// oxlint-disable unicorn/number-literal-case
import { ZstdWasmInitError, ZstdWasmInvalidLevelError } from "../src/errors.js";
import ZstdWasm, { type ZstdWasmOptions } from "../src/zstd-wasm.js";

/**
 * 値が undefined でないことを表明して取り出します。
 */
function unwrap<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("想定外の undefined です。");
  }

  return value;
}

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
 * 言語設定をテスト内でのみ変更するためのフィクスチャーです。
 * 設定した言語はテスト終了後に削除され、ほかのテストに影響しません。
 */
const test = vitest.extend<{
  setLang: (lang: string) => void;
}>({
  async setLang({}, use) {
    await use((lang) => {
      setGlobalConfig({ lang });
    });
    deleteGlobalConfig();
  },
});

// 上流モジュールの解決は open() 時に共有キャッシュで 1 回だけ実行されるため、解決失敗の検証はモジュールを再読み込みした新鮮な実体で行う。
// 静的 import の実体とはキャッシュを共有しないため、後続の往復群に影響しない。
describe("WASM 初期化の失敗", () => {
  test("初期化失敗時は open を ZstdWasmInitError で拒否する", async ({ expect, signal }) => {
    // 準備：
    vi.resetModules();

    try {
      const fresh = await import("../src/zstd-wasm.js");
      const freshErrors = await import("../src/errors.js");
      const freshCore = await import("../src/_core.js");
      const cause = new Error("init failure");
      const initSpy = vi.spyOn(freshCore.api, "init").mockRejectedValueOnce(cause);
      const target = new fresh.default();

      try {
        // 実行：
        const error = await captureRejection(openTarget(target, signal));

        // 検証：
        // 失敗は ZstdWasmInitError で包み、原因を保持する。
        expect(error).toBeInstanceOf(freshErrors.ZstdWasmInitError);
        expect((error as InstanceType<typeof freshErrors.ZstdWasmInitError>).cause).toBe(cause);

        expect(target.isOpen).toBe(false);

        // 実行と検証：
        // 失敗はキャッシュされないため、再試行では解決が再実行される。
        await openTarget(target, signal);
        const input = createPseudoRandomBytes(64, 41);
        const decoded = await decode(target, await encode(target, input));
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
    // 実行：
    const error = new ZstdWasmInitError();

    // 検証：
    expect(error).toBeInstanceOf(globalThis.Error);
    expect(error.name).toBe("UniKvsZstdWasmInitError");
    expect(error.meta).toBeUndefined();
    expect(error.message).toBe("Failed to initialize the zstd module");
  });

  test("cause を保持する", ({ expect }) => {
    // 準備：
    const cause = new Error("原因");

    // 実行：
    const error = new ZstdWasmInitError({ cause });

    // 検証：
    expect(error.cause).toBe(cause);
  });

  test("言語設定が日本語なら日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備：
    const error = new ZstdWasmInitError();

    // 実行：
    setLang("ja");

    // 検証：
    expect(error.message).toBe("zstd モジュールの初期化に失敗しました");
  });
});
describe("ZstdWasmInvalidLevelError", () => {
  test("meta に actual を保持し、既定では英語メッセージを返す", ({ expect }) => {
    // 実行：
    const error = new ZstdWasmInvalidLevelError({ actual: 0 });

    // 検証：
    expect(error).toBeInstanceOf(globalThis.Error);
    expect(error.name).toBe("UniKvsZstdWasmInvalidLevelError");
    expect(error.meta).toStrictEqual({ actual: 0 });
    expect(error.message).toBe("Invalid zstd compression level: 0");
  });

  test("cause を保持する", ({ expect }) => {
    // 準備：
    const cause = new Error("原因");

    // 実行：
    const error = new ZstdWasmInvalidLevelError({
      cause,
      actual: 0,
    });

    // 検証：
    expect(error.cause).toBe(cause);
  });

  test("言語設定が日本語なら日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備：
    const error = new ZstdWasmInvalidLevelError({ actual: 0 });

    // 実行：
    setLang("ja");

    // 検証：
    expect(error.message).toBe("無効な zstd 圧縮レベル: 0");
  });
});
describe("壊れた圧縮データの decode", () => {
  test("空のバイト列をエラーで拒否する", async ({ expect, signal }) => {
    // 準備：
    const target = new ZstdWasm();
    await openTarget(target, signal);

    // 実行と検証：
    // 上流は空の入力を空の展開結果として受け入れるため、破損データとの取り違えを防ぐ契約を検証する。
    await expect(decode(target, new Uint8Array(0))).rejects.toThrow(Error);
  });

  test("圧縮データではないバイト列をエラーで拒否する", async ({ expect, signal }) => {
    // 準備：
    const target = new ZstdWasm();
    await openTarget(target, signal);

    const garbage = createPseudoRandomBytes(64, 21);

    // 実行と検証：
    // 実装は展開失敗を専用エラーで包まず上流エラーをそのまま伝搬するため、汎用エラーを検証する。
    await expect(decode(target, garbage)).rejects.toThrow(Error);
  });

  test("末尾を欠いたデータをエラーで拒否する", async ({ expect, signal }) => {
    // 準備：
    const target = new ZstdWasm();
    await openTarget(target, signal);

    const encoded = await encode(target, createPseudoRandomBytes(4096, 22));

    // 実行と検証：
    await expect(decode(target, encoded.subarray(0, encoded.length - 4))).rejects.toThrow(Error);
  });

  test("先頭を壊したデータをエラーで拒否する", async ({ expect, signal }) => {
    // 準備：
    // 末尾破壊は検出できない場合があるため、先頭のマジックバイトを壊して検証する。
    const target = new ZstdWasm();
    await openTarget(target, signal);

    const encoded = await encode(target, createPseudoRandomBytes(4096, 23));
    const corrupted = encoded.slice();
    const firstByte = corrupted[0];
    corrupted[0] = unwrap(firstByte) ^ 0xff;

    // 実行と検証：
    await expect(decode(target, corrupted)).rejects.toThrow(Error);
  });
});
describe("範囲外レベルのコンストラクター", () => {
  test("有効な境界 1 と 22 は受け付ける", ({ expect }) => {
    // 実行と検証：
    expect(() => new ZstdWasm({ level: 1 })).not.toThrow();
    expect(() => new ZstdWasm({ level: 22 })).not.toThrow();
  });

  test("無効値は ZstdWasmInvalidLevelError で拒否する", ({ expect }) => {
    // 準備：
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

    // 実行と検証：
    for (const value of invalidValues) {
      expect(
        () => new ZstdWasm({ level: value as unknown as ZstdWasmOptions["level"] }),
        String(value),
      ).toThrow(ZstdWasmInvalidLevelError);
    }
  });

  test("meta.actual に指定値をそのまま保持する", ({ expect }) => {
    // 実行と検証：
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
      const thrown = captureThrown(
        () => new ZstdWasm({ level: value as unknown as ZstdWasmOptions["level"] }),
      );
      expect(thrown).toBeInstanceOf(ZstdWasmInvalidLevelError);
      expect((thrown as ZstdWasmInvalidLevelError).meta).toStrictEqual({ actual: value });
    }
  });
});
