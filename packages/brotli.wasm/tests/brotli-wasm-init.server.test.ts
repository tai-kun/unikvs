import type { IMiddleware } from "@unikvs/core";
import {
  abortedSignal,
  captureRejection,
  createDecodeContext,
  createEncodeContext,
  createNext,
  createOpenContext,
  createPseudoRandomBytes,
} from "@unikvs/testing";
import { describe, test, vi } from "vitest";

// 上流モジュールの解決は open() 時に共有キャッシュで1回だけ実行されるため、
// 解決失敗や中断の検証はモジュールを再読み込みした新鮮な実体で行う。
// ブラウザー実行では再読み込みの分離が保証されないため、このファイルはサーバー実行専用とする。

/**
 * ターゲットを開きます。
 */
async function openTarget(
  target: InstanceType<typeof import("../src/brotli-wasm.js").default>,
  signal: AbortSignal,
): Promise<void> {
  await target.open(createOpenContext({ signal }) as IMiddleware.OpenContext);
}

/**
 * バイト列を圧縮して返します。
 */
async function encode(
  target: InstanceType<typeof import("../src/brotli-wasm.js").default>,
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
  target: InstanceType<typeof import("../src/brotli-wasm.js").default>,
  data: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const c = createDecodeContext(data);
  await target.decode(
    c as IMiddleware.DecodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
    createNext(),
  );

  return c.destination;
}

describe("WASM 初期化の失敗", () => {
  test("初期化失敗時は open を BrotliWasmInitError で拒否する", async ({ expect, signal }) => {
    // 準備
    vi.resetModules();

    try {
      const fresh = await import("../src/brotli-wasm.js");
      const freshErrors = await import("../src/errors.js");
      const freshCore = await import("../src/_core.js");
      const cause = new Error("init failure");
      const initSpy = vi.spyOn(freshCore.api, "init").mockRejectedValueOnce(cause);
      const target = new fresh.default();

      try {
        // 実行
        const error = await captureRejection(openTarget(target, signal));

        // 検証
        // 失敗は BrotliWasmInitError で包み、原因を保持する。
        expect(error).toBeInstanceOf(freshErrors.BrotliWasmInitError);
        expect((error as InstanceType<typeof freshErrors.BrotliWasmInitError>).cause).toBe(cause);
        expect(target.isOpen).toBe(false);

        // 実行と検証
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

describe("open の中断", () => {
  test("中断済み signal では open を中断理由で拒否し isOpen は false のままである", async ({
    expect,
    signal,
  }) => {
    // 準備
    vi.resetModules();

    try {
      const fresh = await import("../src/brotli-wasm.js");
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
});
