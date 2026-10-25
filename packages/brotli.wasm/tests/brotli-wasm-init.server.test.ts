import type { IMiddleware } from "@unikvs/core";
import {
  createNext,
  abortedSignal,
  captureRejection,
  createOpenContext,
  createDecodeContext,
  createEncodeContext,
  createPseudoRandomBytes,
} from "@unikvs/testing";
import { vi, test, describe } from "vite-plus/test";

import type BrotliWasm from "../src/brotli-wasm.js";

// 上流モジュールの解決は open() 時に共有キャッシュで 1 回だけ実行されるため、解決失敗や中断の検証はモジュールを再読み込みした新鮮な実体で行う。
// ブラウザー実行では再読み込みの分離が保証されないため、このファイルはサーバー実行専用とする。

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

describe("WASM 初期化の失敗", () => {
  test("初期化失敗時は open を BrotliWasmInitError で拒否する", async ({ expect, signal }) => {
    // 準備：
    vi.resetModules();

    try {
      const fresh = await import("../src/brotli-wasm.js");
      const freshErrors = await import("../src/errors.js");
      const freshCore = await import("../src/_core.js");
      const cause = new Error("init failure");
      const initSpy = vi.spyOn(freshCore.api, "init").mockRejectedValueOnce(cause);
      const target = new fresh.default();

      try {
        // 実行：
        const error = await captureRejection(openTarget(target, signal));

        // 検証：
        // 失敗は BrotliWasmInitError で包み、原因を保持する。
        expect(error).toBeInstanceOf(freshErrors.BrotliWasmInitError);
        expect((error as InstanceType<typeof freshErrors.BrotliWasmInitError>).cause).toBe(cause);

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

describe("open の中断", () => {
  test("中断済み signal では open を中断理由で拒否し isOpen は false のままである", async ({
    expect,
    signal,
  }) => {
    // 準備：
    vi.resetModules();

    try {
      const fresh = await import("../src/brotli-wasm.js");
      const freshCore = await import("../src/_core.js");
      const initSpy = vi.spyOn(freshCore.api, "init");
      const target = new fresh.default();
      const reason = new Error("pre-abort");

      try {
        // 実行：
        const error = await captureRejection(
          target.open(
            createOpenContext({ signal: abortedSignal(reason) }) as IMiddleware.OpenContext,
          ),
        );

        // 検証：
        // 事前中断では初期化自体を開始せず、理由をそのまま伝播する。
        expect(error).toBe(reason);

        expect(target.isOpen).toBe(false);
        expect(initSpy).not.toHaveBeenCalled();

        // 実行と検証：
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

  test("実行中に中断された open は中断理由で拒否し再試行できる", async ({ expect, signal }) => {
    // 準備：
    vi.resetModules();

    try {
      const fresh = await import("../src/brotli-wasm.js");
      const freshCore = await import("../src/_core.js");
      // 中断が実装されていなくても初期化が完了してしまわないよう、解決しない Promise を使う。
      const initSpy = vi
        .spyOn(freshCore.api, "init")
        .mockImplementationOnce(() => new Promise<never>(() => {}));
      const target = new fresh.default();
      const controller = new AbortController();
      const reason = new Error("mid-flight-abort");

      try {
        // 実行：
        const opening = target.open(
          createOpenContext({ signal: controller.signal }) as IMiddleware.OpenContext,
        );

        controller.abort(reason);

        // 検証：
        await expect(opening).rejects.toBe(reason);
        expect(target.isOpen).toBe(false);

        // 実行と検証：
        // 実行中の中断はキャッシュを残さないため、有効な signal では再試行できる。
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
});
