import { brotliCompressSync, brotliDecompressSync } from "node:zlib";

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

import { api } from "../src/_core.js";
import BrotliBun from "../src/brotli-bun.js";

type ByteEncode = IMiddleware.EncodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>;
type ByteDecode = IMiddleware.DecodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>;

/**
 * ターゲットを開きます。
 */
async function openTarget(target: BrotliBun, signal: AbortSignal): Promise<void> {
  await target.open(createOpenContext({ signal }) as IMiddleware.OpenContext);
}

/**
 * バイト列を圧縮して返します。
 */
async function encode(
  target: BrotliBun,
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
  target: BrotliBun,
  data: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const c = createDecodeContext(data);
  await target.decode(c as ByteDecode, createNext());

  return c.destination;
}

/**
 * Bun の brotli API を解決します。
 */
function resolveBunBrotli():
  | { brotliCompressSync: unknown; brotliDecompressSync: unknown }
  | undefined {
  // `Bun` は @types/bun により宣言されているため、typeof による判定は安全です。
  // brotli 関数自体は宣言されていないため、unknown として取り出して判定します。
  if (typeof Bun === "undefined") {
    return undefined;
  }

  const bun = Bun as unknown as Record<string, unknown>;

  if (typeof bun["brotliCompressSync"] !== "function") {
    return undefined;
  }

  if (typeof bun["brotliDecompressSync"] !== "function") {
    return undefined;
  }

  return bun as unknown as { brotliCompressSync: unknown; brotliDecompressSync: unknown };
}

const hasBunBrotli = resolveBunBrotli() !== undefined;

// node:zlib の brotli 系 API が利用できない Node 版ではフォールバック検証をスキップする。
const hasBrotli =
  typeof brotliCompressSync === "function" && typeof brotliDecompressSync === "function";

describe("実行環境の解決", () => {
  test.skipIf(!hasBunBrotli)(
    "Bun ランタイムでは bun 実装が選ばれる",
    async ({ expect, signal }) => {
      // 準備
      vi.resetModules();

      try {
        const freshCore = await import("../src/_core.js");

        // 実行
        const env = await freshCore.api.init();

        // 検証
        expect(env.kind).toBe("bun");

        // 実行と検証
        // 解決した実装で往復できる。
        const target = new BrotliBun();
        await openTarget(target, signal);
        const input = createPseudoRandomBytes(128, 51);
        expect(await decode(target, await encode(target, input))).toStrictEqual(input);
      } finally {
        vi.restoreAllMocks();
      }
    },
  );

  test.skipIf(!hasBrotli)(
    "Bun API がなくても node:zlib フォールバックで往復できる",
    async ({ expect, signal }) => {
      // 準備
      vi.resetModules();

      try {
        const freshCore = await import("../src/_core.js");
        const fresh = await import("../src/brotli-bun.js");
        const detectSpy = vi.spyOn(freshCore.api, "detectBun").mockReturnValue(undefined);

        try {
          // 実行
          const env = await freshCore.api.init();

          // 検証
          // Bun を隠しても node:zlib へフォールバックして初期化できる。
          expect(env.kind).toBe("node");
          expect(detectSpy).toHaveBeenCalledTimes(1);

          // 実行と検証
          // フォールバック実装で往復できる。
          const target = new fresh.default();
          await openTarget(target, signal);
          const input = createPseudoRandomBytes(128, 52);
          expect(await decode(target, await encode(target, input))).toStrictEqual(input);
          expect(target.isOpen).toBe(true);
        } finally {
          detectSpy.mockRestore();
        }
      } finally {
        vi.restoreAllMocks();
      }
    },
  );
});

describe("実行環境の検出", () => {
  test("detectBun はプローブが undefined や null なら undefined を返す", ({ expect }) => {
    // 実行と検証
    expect(api.detectBun(undefined)).toBe(undefined);
    expect(api.detectBun(null)).toBe(undefined);
  });

  test("detectBun は brotli 関数が欠けたプローブでは undefined を返す", ({ expect }) => {
    // 準備
    const compressOnly = { brotliCompressSync: () => new Uint8Array(0) };
    const decompressOnly = { brotliDecompressSync: () => new Uint8Array(0) };

    // 実行と検証
    expect(api.detectBun({})).toBe(undefined);
    expect(api.detectBun(compressOnly)).toBe(undefined);
    expect(api.detectBun(decompressOnly)).toBe(undefined);
  });

  test("detectBun は brotli 関数が揃ったプローブをそのまま返す", ({ expect }) => {
    // 準備
    const probe = {
      brotliCompressSync: () => new Uint8Array(0),
      brotliDecompressSync: () => new Uint8Array(0),
    };

    // 実行と検証
    expect(api.detectBun(probe)).toBe(probe);
  });

  test.skipIf(!hasBunBrotli)("detectBun は実行環境の Bun プローブを返す", ({ expect }) => {
    // 実行と検証
    const bun = api.detectBun(Reflect.get(globalThis, "Bun"));
    expect(bun).not.toBe(undefined);
    expect(typeof bun?.brotliCompressSync).toBe("function");
    expect(typeof bun?.brotliDecompressSync).toBe("function");
  });

  test("createNodeEnv は brotli 系 API が欠けているとエラーを投げる", ({ expect }) => {
    // 実行と検証
    expect(() => api.createNodeEnv({} as unknown as typeof import("node:zlib"))).toThrow(
      "brotliCompressSync is not available in node:zlib",
    );
    expect(() =>
      api.createNodeEnv({
        brotliCompressSync: () => new Uint8Array(0),
      } as unknown as typeof import("node:zlib")),
    ).toThrow("brotliDecompressSync is not available in node:zlib");
  });

  test.skipIf(!hasBrotli)(
    "createNodeEnv は実物の node:zlib から node 環境を作る",
    async ({ expect }) => {
      // 準備
      const zlib = await import("node:zlib");

      // 実行
      const env = api.createNodeEnv(zlib);

      // 検証
      expect(env.kind).toBe("node");
      const input = new Uint8Array([1, 2, 3]);
      expect(new Uint8Array(env.decompressSync(env.compressSync(input, 11)))).toStrictEqual(input);
    },
  );
});

describe("open による初期化", () => {
  test("2 回目の open も成功し初期化は1回だけ実行される", async ({ expect, signal }) => {
    // 準備
    vi.resetModules();

    try {
      const fresh = await import("../src/brotli-bun.js");
      const freshCore = await import("../src/_core.js");
      const initSpy = vi.spyOn(freshCore.api, "init");
      const target = new fresh.default();

      try {
        // 実行
        await openTarget(target, signal);
        await openTarget(target, signal);

        // 検証
        expect(target.isOpen).toBe(true);
        expect(initSpy).toHaveBeenCalledTimes(1);
      } finally {
        initSpy.mockRestore();
      }
    } finally {
      vi.restoreAllMocks();
    }
  });

  test("並行した open は初期化を共有して成功する", async ({ expect, signal }) => {
    // 準備
    vi.resetModules();

    try {
      const fresh = await import("../src/brotli-bun.js");
      const freshCore = await import("../src/_core.js");
      const initSpy = vi.spyOn(freshCore.api, "init");
      const first = new fresh.default();
      const second = new fresh.default();
      const input = createPseudoRandomBytes(128, 53);

      // 実行
      await Promise.all([openTarget(first, signal), openTarget(second, signal)]);
      const decoded = await decode(second, await encode(first, input));

      // 検証
      expect(first.isOpen).toBe(true);
      expect(second.isOpen).toBe(true);
      expect(decoded).toStrictEqual(input);
      expect(initSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.restoreAllMocks();
    }
  });

  test("解決に失敗すると open を UnsupportedRuntimeError で拒否する", async ({
    expect,
    signal,
  }) => {
    // 準備
    vi.resetModules();

    try {
      const fresh = await import("../src/brotli-bun.js");
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
        ).toStrictEqual({ name: "BrotliBun", runtime: "Bun" });
        expect(target.isOpen).toBe(false);

        // 実行と検証
        // 失敗はキャッシュされないため、再試行では解決が再実行される。
        await openTarget(target, signal);
        const input = createPseudoRandomBytes(64, 54);
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

describe("open の中断", () => {
  test("中断済み signal では open を中断理由で拒否し isOpen は false のままである", async ({
    expect,
    signal,
  }) => {
    // 準備
    vi.resetModules();

    try {
      const fresh = await import("../src/brotli-bun.js");
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
        const input = createPseudoRandomBytes(64, 55);
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
    // 準備
    vi.resetModules();

    try {
      const fresh = await import("../src/brotli-bun.js");
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
        const input = createPseudoRandomBytes(64, 56);
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
    const target = new BrotliBun();
    await openTarget(target, signal);
    const input = createPseudoRandomBytes(64, 57);

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
