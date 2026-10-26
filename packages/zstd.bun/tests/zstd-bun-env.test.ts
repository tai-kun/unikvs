import { zstdCompressSync, zstdDecompressSync } from "node:zlib";

import type { IMiddleware } from "@unikvs/core";
import {
  readAll,
  bytesEqual,
  createNext,
  sourceFrom,
  concatBytes,
  abortedSignal,
  captureRejection,
  createOpenContext,
  createDecodeContext,
  createEncodeContext,
  createPseudoRandomBytes,
  createDecodeStreamContext,
  createEncodeStreamContext,
} from "@unikvs/testing";
import { vi, test, describe } from "vite-plus/test";

import { api } from "../src/_core.js";
import ZstdBun from "../src/zstd-bun.js";
import { createLevelSensitiveInput } from "./_fixtures.js";

type ByteEncode = IMiddleware.EncodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>;

type ByteDecode = IMiddleware.DecodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>;

type ByteEncodeStream = IMiddleware.EncodeStreamContext<
  Uint8Array<ArrayBuffer>,
  Uint8Array<ArrayBuffer>
>;

type ByteDecodeStream = IMiddleware.DecodeStreamContext<
  Uint8Array<ArrayBuffer>,
  Uint8Array<ArrayBuffer>
>;

/**
 * ターゲットを開きます。
 */
async function openTarget(target: ZstdBun, signal: AbortSignal): Promise<void> {
  await target.open(createOpenContext({ signal }) as IMiddleware.OpenContext);
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

const hasBunZstd = resolveBunZstd() !== undefined;

// node:zlib の zstd 系 API が利用できない Node 版ではフォールバック検証をスキップする。
const hasZstd = typeof zstdCompressSync === "function" && typeof zstdDecompressSync === "function";
describe("実行環境の解決", () => {
  test.skipIf(!hasBunZstd)("Bun ランタイムでは bun 実装が選ばれる", async ({ expect, signal }) => {
    // 準備：
    vi.resetModules();

    try {
      const freshCore = await import("../src/_core.js");

      // 実行：
      const env = await freshCore.api.init();

      // 検証：
      expect(env.kind).toBe("bun");

      // 実行と検証：
      // 解決した実装で往復できる。
      const target = new ZstdBun();
      await openTarget(target, signal);

      const input = createPseudoRandomBytes(128, 51);
      expect(await decode(target, await encode(target, input))).toStrictEqual(input);
    } finally {
      vi.restoreAllMocks();
    }
  });

  test.skipIf(!hasZstd)(
    "Bun API がなくても node:zlib フォールバックで往復できる",
    async ({ expect, signal }) => {
      // 準備：
      vi.resetModules();

      try {
        const freshCore = await import("../src/_core.js");
        const fresh = await import("../src/zstd-bun.js");
        const detectSpy = vi.spyOn(freshCore.api, "detectBun").mockReturnValue(undefined);

        try {
          // 実行：
          const env = await freshCore.api.init();

          // 検証：
          // Bun を隠しても node:zlib へフォールバックして初期化できる。
          expect(env.kind).toBe("node");

          expect(detectSpy).toHaveBeenCalledTimes(1);

          // 実行と検証：
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

  test.skipIf(!hasZstd)(
    "node:zlib フォールバックでは一括変換とストリーム変換の出力を所有化する",
    async ({ expect, signal }) => {
      // 準備：
      vi.resetModules();

      try {
        const freshCore = await import("../src/_core.js");
        const fresh = await import("../src/zstd-bun.js");
        vi.spyOn(freshCore.api, "detectBun").mockReturnValue(undefined);

        const target = new fresh.default();
        await openTarget(target, signal);

        const input = createPseudoRandomBytes(128, 58);

        // node:zlib の出力は環境により 8/16 KiB の pool を共有する場合がある。
        // Bun ランタイムの node:zlib 互換実装などは所有化済みのバッファーを返すことがある。
        // 前提の有無にかかわらず所有化の検証自体は有効なため、前提のアサーションは行わない。

        // 実行（一括変換）。
        const encoded = await encode(target, input);
        const decoded = await decode(target, encoded);

        // 検証：
        expect(encoded.byteOffset).toBe(0);
        expect(encoded.byteLength).toBe(encoded.buffer.byteLength);
        expect(decoded.byteOffset).toBe(0);
        expect(decoded.byteLength).toBe(decoded.buffer.byteLength);
        expect(decoded).toStrictEqual(input);

        // 実行（ストリーム変換）。
        const encodeContext = createEncodeStreamContext(sourceFrom([input]));
        await target.encodeStream(encodeContext as ByteEncodeStream, createNext());

        const encodedChunks = await readAll(
          encodeContext.destination as ReadableStream<Uint8Array<ArrayBuffer>>,
        );
        const decodeContext = createDecodeStreamContext(sourceFrom([concatBytes(encodedChunks)]));
        await target.decodeStream(decodeContext as ByteDecodeStream, createNext());

        const decodedChunks = await readAll(
          decodeContext.destination as ReadableStream<Uint8Array<ArrayBuffer>>,
        );

        // 検証：
        expect(encodedChunks.length).toBeGreaterThan(0);
        expect(decodedChunks.length).toBeGreaterThan(0);

        for (const chunk of [...encodedChunks, ...decodedChunks]) {
          expect(chunk.byteOffset).toBe(0);
          expect(chunk.byteLength).toBe(chunk.buffer.byteLength);
        }

        expect(concatBytes(decodedChunks)).toStrictEqual(input);
      } finally {
        vi.restoreAllMocks();
      }
    },
  );
});
describe("実行環境の検出", () => {
  test("detectBun はプローブが undefined や null なら undefined を返す", ({ expect }) => {
    // 実行と検証：
    expect(api.detectBun(undefined)).toBe(undefined);
    expect(api.detectBun(null)).toBe(undefined);
  });

  test("detectBun は zstd 関数が欠けたプローブでは undefined を返す", ({ expect }) => {
    // 準備：
    const compressOnly = { zstdCompressSync: (): Uint8Array => new Uint8Array(0) };
    const decompressOnly = { zstdDecompressSync: (): Uint8Array => new Uint8Array(0) };

    // 実行と検証：
    expect(api.detectBun({})).toBe(undefined);
    expect(api.detectBun(compressOnly)).toBe(undefined);
    expect(api.detectBun(decompressOnly)).toBe(undefined);
  });

  test("detectBun は zstd 関数が揃ったプローブをそのまま返す", ({ expect }) => {
    // 準備：
    const probe = {
      zstdCompressSync: (): Uint8Array => new Uint8Array(0),
      zstdDecompressSync: (): Uint8Array => new Uint8Array(0),
    };

    // 実行と検証：
    expect(api.detectBun(probe)).toBe(probe);
  });

  test.skipIf(!hasBunZstd)("detectBun は実行環境の Bun プローブを返す", ({ expect }) => {
    // 実行と検証：
    const bun = api.detectBun(Reflect.get(globalThis, "Bun"));
    expect(bun).not.toBe(undefined);
    expect(typeof bun?.zstdCompressSync).toBe("function");
    expect(typeof bun?.zstdDecompressSync).toBe("function");
  });

  test("createNodeEnv は zstd 系 API が欠けているとエラーを投げる", ({ expect }) => {
    // 実行と検証：
    expect(() =>
      api.createNodeEnv({} as unknown as Parameters<typeof api.createNodeEnv>[0]),
    ).toThrow("zstdCompressSync is not available in node:zlib");
    expect(() =>
      api.createNodeEnv({
        zstdCompressSync: (): Uint8Array => new Uint8Array(0),
      } as unknown as Parameters<typeof api.createNodeEnv>[0]),
    ).toThrow("zstdDecompressSync is not available in node:zlib");
  });

  test.skipIf(!hasZstd)(
    "createNodeEnv は実物の node:zlib から node 環境を作る",
    async ({ expect }) => {
      // 準備：
      const zlib = await import("node:zlib");

      // 実行：
      const env = api.createNodeEnv(zlib);

      // 検証：
      expect(env.kind).toBe("node");

      const input = new Uint8Array([1, 2, 3]);
      expect(new Uint8Array(env.decompressSync(env.compressSync(input, 3)))).toStrictEqual(input);
    },
  );

  test.skipIf(!hasZstd)(
    "createNodeEnv は指定したレベルを ZSTD_c_compressionLevel に変換する",
    async ({ expect }) => {
      // 準備：
      const zlib = await import("node:zlib");
      const env = api.createNodeEnv(zlib);
      const input = createLevelSensitiveInput();

      // 実行：
      const low = env.compressSync(input, 1);
      const high = env.compressSync(input, 19);

      // 検証：
      // params の変換が欠落したり固定値になると、レベル 1 と 19 の出力が一致する。
      expect(bytesEqual(low, high)).toBe(false);
    },
  );
});

describe("open による初期化", () => {
  test("2 回目の open も成功し初期化は1回だけ実行される", async ({ expect, signal }) => {
    // 準備：
    vi.resetModules();

    try {
      const fresh = await import("../src/zstd-bun.js");
      const freshCore = await import("../src/_core.js");
      const initSpy = vi.spyOn(freshCore.api, "init");
      const target = new fresh.default();

      try {
        // 実行：
        await openTarget(target, signal);
        await openTarget(target, signal);

        // 検証：
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
    // 準備：
    vi.resetModules();

    try {
      const fresh = await import("../src/zstd-bun.js");
      const freshCore = await import("../src/_core.js");
      const initSpy = vi.spyOn(freshCore.api, "init");
      const first = new fresh.default();
      const second = new fresh.default();
      const input = createPseudoRandomBytes(128, 53);

      // 実行：
      await Promise.all([openTarget(first, signal), openTarget(second, signal)]);

      const decoded = await decode(second, await encode(first, input));

      // 検証：
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
    // 準備：
    vi.resetModules();

    try {
      const fresh = await import("../src/zstd-bun.js");
      const freshErrors = await import("../src/errors.js");
      const freshCore = await import("../src/_core.js");
      const cause = new Error("load failure");
      const loadSpy = vi.spyOn(freshCore.api, "init").mockRejectedValueOnce(cause);
      const target = new fresh.default();

      try {
        // 実行：
        const error = await captureRejection(
          target.open(createOpenContext({ signal }) as IMiddleware.OpenContext),
        );

        // 検証：
        // 失敗は UnsupportedRuntimeError で包み、原因と識別子を保持する。
        expect(error).toBeInstanceOf(freshErrors.UnsupportedRuntimeError);
        expect((error as InstanceType<typeof freshErrors.UnsupportedRuntimeError>).cause).toBe(
          cause,
        );
        expect(
          (error as InstanceType<typeof freshErrors.UnsupportedRuntimeError>).meta,
        ).toStrictEqual({
          name: "ZstdBun",
          runtime: "Bun",
        });

        expect(target.isOpen).toBe(false);

        // 実行と検証：
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
    // 準備：
    vi.resetModules();

    try {
      const fresh = await import("../src/zstd-bun.js");
      const freshCore = await import("../src/_core.js");
      const initSpy = vi.spyOn(freshCore.api, "init");
      const target = new fresh.default();

      try {
        // 実行：
        const error = await captureRejection(
          target.open(createOpenContext({ signal: abortedSignal() }) as IMiddleware.OpenContext),
        );

        // 検証：
        // 事前中断では初期化自体を開始しない。
        expect(error).toBeInstanceOf(DOMException);

        expect(target.isOpen).toBe(false);
        expect(initSpy).not.toHaveBeenCalled();

        // 実行と検証：
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
    // 準備：
    vi.resetModules();

    try {
      const fresh = await import("../src/zstd-bun.js");
      const freshCore = await import("../src/_core.js");
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
    // 準備：
    const target = new ZstdBun();
    await openTarget(target, signal);

    const input = createPseudoRandomBytes(64, 57);

    // 実行と検証：
    await expect(
      target.open(createOpenContext({ signal: abortedSignal() }) as IMiddleware.OpenContext),
    ).rejects.toBeInstanceOf(DOMException);
    expect(target.isOpen).toBe(true);

    // 実行と検証：
    // 既存の実行環境は破棄されないため、引き続き往復できる。
    const decoded = await decode(target, await encode(target, input));
    expect(decoded).toStrictEqual(input);
  });
});
