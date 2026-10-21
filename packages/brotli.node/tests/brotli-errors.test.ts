import type { IMiddleware } from "@unikvs/core";
import {
  abortedSignal,
  captureRejection,
  captureThrown,
  createDecodeContext,
  createDecodeStreamContext,
  createEncodeContext,
  createNext,
  createOpenContext,
  createPseudoRandomBytes,
  sourceFrom,
} from "@unikvs/testing";
import { deleteGlobalConfig, setGlobalConfig } from "valibot";
import { describe, test as vitest, vi } from "vitest";

import Brotli, { type BrotliOptions } from "../src/brotli.js";
import { BrotliInvalidLevelError } from "../src/errors.js";

/**
 * 言語設定をテスト内でのみ変更するためのフィクスチャーです。
 * 設定した言語はテスト終了後に削除され、ほかのテストに影響しません。
 *
 * valibot は brotli の直接依存ではないため、@unikvs/core が使う実体を
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

// 上流モジュールの解決は open() 時に共有キャッシュで1回だけ実行されるため、
// 解決失敗や中断の検証はモジュールを再読み込みした新鮮な実体で行う。
// 静的 import の実体とはキャッシュを共有しないため、後続の往復群に影響しない。

/**
 * ターゲットを開きます。
 */
async function openTarget(target: Brotli, signal: AbortSignal): Promise<void> {
  await target.open(createOpenContext({ signal }) as IMiddleware.OpenContext);
}

/**
 * バイト列を圧縮して返します。
 */
async function encode(
  target: Brotli,
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
  target: Brotli,
  data: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const c = createDecodeContext(data);
  await target.decode(
    c as IMiddleware.DecodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
    createNext(),
  );

  return c.destination;
}

describe("対応しない実行環境", () => {
  test("node:zlib の解決に失敗すると open を UnsupportedRuntimeError で拒否する", async ({
    expect,
    signal,
  }) => {
    // 準備
    vi.resetModules();

    try {
      const fresh = await import("../src/brotli.js");
      const freshErrors = await import("../src/errors.js");
      const freshCore = await import("../src/_core.js");
      const cause = new Error("load failure");
      const loadSpy = vi.spyOn(freshCore.api, "init").mockRejectedValueOnce(cause);
      const target = new fresh.default();

      try {
        // 実行
        const error = await captureRejection(
          target.open(createOpenContext({ signal }) as IMiddleware.OpenContext),
        );

        // 検証
        // 失敗は UnsupportedRuntimeError で包み、原因と識別子を保持する。
        expect(error).toBeInstanceOf(freshErrors.UnsupportedRuntimeError);
        expect((error as InstanceType<typeof freshErrors.UnsupportedRuntimeError>).cause).toBe(
          cause,
        );
        expect(
          (error as InstanceType<typeof freshErrors.UnsupportedRuntimeError>).meta,
        ).toStrictEqual({ name: "Brotli", runtime: "Node.js" });
        expect(target.isOpen).toBe(false);

        // 実行と検証
        // 失敗はキャッシュされないため、再試行では解決が再実行される。
        await openTarget(target, signal);
        const input = createPseudoRandomBytes(64, 41);
        const decoded = await decode(target, await encode(target, input));
        expect(decoded).toStrictEqual(input);
        expect(target.isOpen).toBe(true);
        expect(loadSpy).toHaveBeenCalledTimes(2);
      } finally {
        loadSpy.mockRestore();
      }
    } finally {
      vi.restoreAllMocks();
    }
  });
});

describe("BrotliInvalidLevelError", () => {
  test("meta に actual を保持し、既定では英語メッセージを返す", ({ expect }) => {
    // 実行
    const error = new BrotliInvalidLevelError({ actual: 12 });

    // 検証
    expect(error).toBeInstanceOf(globalThis.Error);
    expect(error.name).toBe("UniKvsBrotliInvalidLevelError");
    expect(error.meta).toStrictEqual({ actual: 12 });
    expect(error.message).toBe("Invalid brotli compression level: 12");
  });

  test("cause を保持する", ({ expect }) => {
    // 準備
    const cause = new Error("原因");

    // 実行
    const error = new BrotliInvalidLevelError({ actual: 12, cause });

    // 検証
    expect(error.cause).toBe(cause);
  });

  test("言語設定が日本語なら日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備
    const error = new BrotliInvalidLevelError({ actual: 12 });

    // 実行
    setLang("ja");

    // 検証
    expect(error.message).toBe("無効な brotli 圧縮レベル: 12");
  });
});

describe("壊れた圧縮データの decode", () => {
  test("圧縮データではないバイト列をエラーで拒否する", async ({ expect, signal }) => {
    // 準備
    const target = new Brotli();
    await openTarget(target, signal);
    const garbage = createPseudoRandomBytes(64, 21);

    // 実行と検証
    // 実装は展開失敗を専用エラーで包まず上流エラーをそのまま伝搬するため、汎用エラーを検証する。
    await expect(decode(target, garbage)).rejects.toThrow(Error);
  });

  test("末尾を欠いたデータをエラーで拒否する", async ({ expect, signal }) => {
    // 準備
    const target = new Brotli();
    await openTarget(target, signal);
    const encoded = await encode(target, createPseudoRandomBytes(4096, 22));

    // 実行と検証
    await expect(decode(target, encoded.subarray(0, encoded.length - 4))).rejects.toThrow(Error);
  });

  test("先頭を壊したデータをエラーで拒否する", async ({ expect, signal }) => {
    // 準備
    const target = new Brotli();
    await openTarget(target, signal);
    const encoded = await encode(target, createPseudoRandomBytes(4096, 23));
    const corrupted = encoded.slice();
    corrupted[0] = corrupted[0]! ^ 0xff;

    // 実行と検証
    await expect(decode(target, corrupted)).rejects.toThrow(Error);
  });

  test("decode が失敗しても isOpen は true のままである", async ({ expect, signal }) => {
    // 準備
    const target = new Brotli();
    await openTarget(target, signal);
    const invalidData = new Uint8Array([0, 1, 2, 3]);

    // 実行と検証
    await expect(decode(target, invalidData)).rejects.toThrow(Error);
    expect(target.isOpen).toBe(true);
  });

  test("切り詰めたデータをストリームで流すとエラーが観測される", async ({ expect, signal }) => {
    // 準備
    const target = new Brotli();
    await openTarget(target, signal);
    const encoded = await encode(target, createPseudoRandomBytes(4096, 24));
    const truncated = encoded.subarray(0, encoded.length - 4);
    const c = createDecodeStreamContext(sourceFrom([truncated]));
    await target.decodeStream(
      c as IMiddleware.DecodeStreamContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
      createNext(),
    );

    // 実行と検証
    const reader = (c.destination as ReadableStream<Uint8Array<ArrayBuffer>>).getReader();
    await expect(
      (async () => {
        for (;;) {
          const { done } = await reader.read();

          if (done) {
            break;
          }
        }
      })(),
    ).rejects.toThrow(Error);
  });
});

describe("範囲外レベルのコンストラクター", () => {
  test("有効な境界 0 と 11 は受け付ける", ({ expect }) => {
    // 実行と検証
    expect(() => new Brotli({ level: 0 })).not.toThrow();
    expect(() => new Brotli({ level: 11 })).not.toThrow();
  });

  test("無効値は BrotliInvalidLevelError で拒否し指定値を meta.actual に保持する", ({ expect }) => {
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
      const thrown = captureThrown(
        () => new Brotli({ level: value as unknown as BrotliOptions["level"] }),
      );

      expect(thrown, `${String(value)}`).toBeInstanceOf(BrotliInvalidLevelError);
      expect((thrown as BrotliInvalidLevelError).meta).toStrictEqual({ actual: value });
    }
  });
});

describe("open 前の使用", () => {
  test("open 前の encode と decode は TypeError で拒否される", async ({ expect }) => {
    // 準備
    // 実装は open() で解決した実行環境を必須とするため、未 open の使用は TypeError になる。
    const target = new Brotli();
    const input = createPseudoRandomBytes(128, 31);

    // 実行と検証
    expect(target.isOpen).toBe(false);
    await expect(encode(target, input)).rejects.toThrow(TypeError);
    await expect(decode(target, input)).rejects.toThrow(TypeError);
  });
});

describe("open の中断", () => {
  test("中断済み signal では open を中断理由で拒否し isOpen は false のままである", async ({
    expect,
    signal,
  }) => {
    // 準備
    vi.resetModules();

    try {
      const fresh = await import("../src/brotli.js");
      const freshCore = await import("../src/_core.js");
      const initSpy = vi.spyOn(freshCore.api, "init");
      const target = new fresh.default();

      try {
        // 実行
        const error = await captureRejection(
          target.open(createOpenContext({ signal: abortedSignal() }) as IMiddleware.OpenContext),
        );

        // 検証
        // 事前中断では初期化自体を開始しない。
        expect(error).toBeInstanceOf(DOMException);
        expect(target.isOpen).toBe(false);
        expect(initSpy).not.toHaveBeenCalled();

        // 実行と検証
        // 中断はキャッシュを汚さないため、有効な signal では再試行できる。
        await openTarget(target, signal);
        const input = createPseudoRandomBytes(64, 32);
        const decoded = await decode(target, await encode(target, input));
        expect(decoded).toStrictEqual(input);
        expect(target.isOpen).toBe(true);
        expect(initSpy).toHaveBeenCalledTimes(1);
      } finally {
        initSpy.mockRestore();
      }
    } finally {
      vi.restoreAllMocks();
    }
  });

  test("カスタム reason の中断は reason のまま伝播する", async ({ expect }) => {
    // 準備
    vi.resetModules();

    try {
      const fresh = await import("../src/brotli.js");
      const target = new fresh.default();
      const reason = new Error("custom-abort");

      // 実行と検証
      await expect(
        target.open(
          createOpenContext({ signal: abortedSignal(reason) }) as IMiddleware.OpenContext,
        ),
      ).rejects.toBe(reason);
      expect(target.isOpen).toBe(false);
    } finally {
      vi.restoreAllMocks();
    }
  });

  test("実行中に中断された open は中断理由で拒否し再試行できる", async ({ expect, signal }) => {
    // 準備
    vi.resetModules();

    try {
      const fresh = await import("../src/brotli.js");
      const freshCore = await import("../src/_core.js");
      const initSpy = vi
        .spyOn(freshCore.api, "init")
        .mockImplementationOnce(() => new Promise<never>(() => {}));
      const target = new fresh.default();
      const controller = new AbortController();
      const reason = new Error("mid-flight-abort");

      try {
        // 実行
        const opening = target.open(
          createOpenContext({ signal: controller.signal }) as IMiddleware.OpenContext,
        );
        controller.abort(reason);

        // 検証
        await expect(opening).rejects.toBe(reason);
        expect(target.isOpen).toBe(false);

        // 実行と検証
        // 実行中の破棄はキャッシュを残さないため、有効な signal では再試行できる。
        await openTarget(target, signal);
        const input = createPseudoRandomBytes(64, 33);
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

  test("開済み状態での中断済み open は拒否するが isOpen は true のままである", async ({
    expect,
    signal,
  }) => {
    // 準備
    const target = new Brotli();
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
