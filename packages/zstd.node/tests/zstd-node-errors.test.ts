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
import type { IEnv } from "../src/_core.js";
import { UnsupportedRuntimeError, ZstdNodeInvalidLevelError } from "../src/errors.js";
import ZstdNode, { type ZstdNodeOptions } from "../src/zstd-node.js";

/**
 * 値が undefined でないことを表明して取り出します。
 */
function unwrap<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("想定外の undefined です。");
  }

  return value;
}

/**
 * 言語設定をテスト内でのみ変更するためのフィクスチャーです。
 * 設定した言語はテスト終了後に削除され、ほかのテストに影響しません。
 *
 * valibot は zstd の直接依存ではないため、@unikvs/core が使う実体を明示的に参照しています。
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

// 上流モジュールの解決は open() 時に共有キャッシュで 1 回だけ実行されるため、解決失敗や中断の検証はモジュールを再読み込みした新鮮な実体で行う。
// 静的 import の実体とはキャッシュを共有しないため、後続の往復群に影響しない。

/**
 * ターゲットを開きます。
 */
async function openTarget(target: ZstdNode, signal: AbortSignal): Promise<void> {
  await target.open(createOpenContext({ signal }) as IMiddleware.OpenContext);
}

/**
 * バイト列を圧縮して返します。
 */
async function encode(
  target: ZstdNode,
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
  target: ZstdNode,
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
    // 準備：
    vi.resetModules();

    try {
      const fresh = await import("../src/zstd-node.js");
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
          name: "ZstdNode",
          runtime: "Node.js",
        });

        expect(target.isOpen).toBe(false);

        // 実行と検証：
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

  test("zstd 圧縮関数がなくても open は成功し encode を TypeError で拒否する", async ({
    expect,
    signal,
  }) => {
    // 準備：
    vi.resetModules();

    try {
      const fresh = await import("../src/zstd-node.js");
      const freshCore = await import("../src/_core.js");
      const real = await freshCore.api.init();
      const withoutCompress = {
        ...real,
        zstdCompress: undefined,
      } as unknown as IEnv;
      const loadSpy = vi.spyOn(freshCore.api, "init").mockResolvedValueOnce(withoutCompress);
      const target = new fresh.default();

      try {
        // 実行と検証：
        // 実装は open() で関数の有無を検証しないため、欠落は使用時に表面化する。
        await openTarget(target, signal);
        expect(target.isOpen).toBe(true);
        await expect(encode(target, new Uint8Array([1]))).rejects.toThrow(TypeError);
        expect(loadSpy).toHaveBeenCalledTimes(1);
      } finally {
        loadSpy.mockRestore();
      }
    } finally {
      vi.restoreAllMocks();
    }
  });

  test("zstd 展開関数がなくても open は成功し decode を TypeError で拒否する", async ({
    expect,
    signal,
  }) => {
    // 準備：
    vi.resetModules();

    try {
      const fresh = await import("../src/zstd-node.js");
      const freshCore = await import("../src/_core.js");
      const real = await freshCore.api.init();
      const withoutDecompress = {
        ...real,
        zstdDecompress: undefined,
      } as unknown as IEnv;
      const loadSpy = vi.spyOn(freshCore.api, "init").mockResolvedValueOnce(withoutDecompress);
      const target = new fresh.default();

      try {
        // 実行と検証：
        // 実装は open() で関数の有無を検証しないため、欠落は使用時に表面化する。
        await openTarget(target, signal);
        expect(target.isOpen).toBe(true);
        await expect(decode(target, new Uint8Array([1]))).rejects.toThrow(TypeError);
        expect(loadSpy).toHaveBeenCalledTimes(1);
      } finally {
        loadSpy.mockRestore();
      }
    } finally {
      vi.restoreAllMocks();
    }
  });
});

describe("ZstdNodeInvalidLevelError", () => {
  test("meta に actual を保持し、既定では英語メッセージを返す", ({ expect }) => {
    // 実行：
    const error = new ZstdNodeInvalidLevelError({ actual: 0 });

    // 検証：
    expect(error).toBeInstanceOf(globalThis.Error);
    expect(error.name).toBe("UniKvsZstdNodeInvalidLevelError");
    expect(error.meta).toStrictEqual({ actual: 0 });
    expect(error.message).toBe("Invalid zstd compression level: 0");
  });

  test("cause を保持する", ({ expect }) => {
    // 準備：
    const cause = new Error("原因");

    // 実行：
    const error = new ZstdNodeInvalidLevelError({
      cause,
      actual: 0,
    });

    // 検証：
    expect(error.cause).toBe(cause);
  });

  test("言語設定が日本語なら日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備：
    const error = new ZstdNodeInvalidLevelError({ actual: 0 });

    // 実行：
    setLang("ja");

    // 検証：
    expect(error.message).toBe("無効な zstd 圧縮レベル: 0");
  });
});

describe("UnsupportedRuntimeError", () => {
  test("既定では英語メッセージを返す", ({ expect }) => {
    // 実行：
    const error = new UnsupportedRuntimeError({
      name: "ZstdNode",
      runtime: "Node.js",
    });

    // 検証：
    expect(error).toBeInstanceOf(globalThis.Error);
    expect(error.name).toBe("UniKvsUnsupportedRuntimeError");
    expect(error.meta).toStrictEqual({
      name: "ZstdNode",
      runtime: "Node.js",
    });
    expect(error.message).toBe("ZstdNode can only be used in the Node.js runtime");
  });

  test("cause を保持する", ({ expect }) => {
    // 準備：
    const cause = new Error("原因");

    // 実行：
    const error = new UnsupportedRuntimeError({
      name: "ZstdNode",
      cause,
      runtime: "Node.js",
    });

    // 検証：
    expect(error.cause).toBe(cause);
  });

  test("言語設定が日本語なら日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備：
    const error = new UnsupportedRuntimeError({
      name: "ZstdNode",
      runtime: "Node.js",
    });

    // 実行：
    setLang("ja");

    // 検証：
    expect(error.message).toBe("ZstdNode は Node.js ランタイムでのみ使用できます");
  });
});

describe("壊れた圧縮データの decode", () => {
  test("空のバイト列をエラーで拒否する", async ({ expect, signal }) => {
    // 準備：
    const target = new ZstdNode();
    await openTarget(target, signal);

    // 実行と検証：
    // 上流の node:zlib は空の入力を展開エラーにするため、その契約を維持する。
    await expect(decode(target, new Uint8Array(0))).rejects.toThrow(Error);
  });

  test("圧縮データではないバイト列をエラーで拒否する", async ({ expect, signal }) => {
    // 準備：
    const target = new ZstdNode();
    await openTarget(target, signal);

    const garbage = createPseudoRandomBytes(64, 21);

    // 実行と検証：
    // 実装は展開失敗を専用エラーで包まず上流エラーをそのまま伝搬するため、汎用エラーを検証する。
    await expect(decode(target, garbage)).rejects.toThrow(Error);
  });

  test("末尾を欠いたデータをエラーで拒否する", async ({ expect, signal }) => {
    // 準備：
    const target = new ZstdNode();
    await openTarget(target, signal);

    const encoded = await encode(target, createPseudoRandomBytes(4096, 22));

    // 実行と検証：
    await expect(decode(target, encoded.subarray(0, encoded.length - 4))).rejects.toThrow(Error);
  });

  test("先頭を壊したデータをエラーで拒否する", async ({ expect, signal }) => {
    // 準備：
    // 末尾破壊は検出できない場合があるため、先頭のマジックバイトを壊して検証する。
    const target = new ZstdNode();
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
    expect(() => new ZstdNode({ level: 1 })).not.toThrow();
    expect(() => new ZstdNode({ level: 22 })).not.toThrow();
  });

  test("無効値は ZstdNodeInvalidLevelError で拒否する", ({ expect }) => {
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
        () => new ZstdNode({ level: value as unknown as ZstdNodeOptions["level"] }),
        String(value),
      ).toThrow(ZstdNodeInvalidLevelError);
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
        () => new ZstdNode({ level: value as unknown as ZstdNodeOptions["level"] }),
      );
      expect(thrown).toBeInstanceOf(ZstdNodeInvalidLevelError);
      expect((thrown as ZstdNodeInvalidLevelError).meta).toStrictEqual({ actual: value });
    }
  });
});
