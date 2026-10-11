import { createPseudoRandomBytes } from "@unikvs/testing";
import { describe, test as vitest, vi } from "vitest";

import { deleteGlobalConfig, setGlobalConfig } from "../../core/node_modules/valibot/dist/index.js";
import {
  UnsupportedRuntimeError,
  ZstdNodeDecompressError,
  ZstdNodeInvalidLevelError,
} from "../src/errors.js";
import ZstdNode, { type ZstdNodeOptions } from "../src/zstd-node.js";

/**
 * 言語設定をテスト内でのみ変更するためのフィクスチャーです。
 * 設定した言語はテスト終了後に削除され、ほかのテストに影響しません。
 *
 * valibot は zstd の直接依存ではないため、@unikvs/core が使う実体を
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

// 上流モジュールの解決は共有キャッシュで1回だけ実行されるため、
// 解決失敗の 4 件はモジュールを再読み込みした新鮮な実体で検証する。
// 静的 import の実体とはキャッシュを共有しないため、後続の往復群に影響しない。
describe("対応しない実行環境", () => {
  test("node:zlib の解決に失敗すると encode を UnsupportedRuntimeError で拒否する", async ({
    expect,
  }) => {
    // 準備
    vi.resetModules();

    try {
      const fresh = await import("../src/zstd-node.js");
      const freshErrors = await import("../src/errors.js");
      const freshBridge = await import("../src/_zlib.js");
      const loadSpy = vi
        .spyOn(freshBridge.zlibBridge, "load")
        .mockRejectedValueOnce(new Error("load failure"));
      const target = new fresh.default();

      try {
        // 実行と検証
        await expect(target.encode({ data: new Uint8Array([1]) })).rejects.toThrow(
          freshErrors.UnsupportedRuntimeError,
        );

        // 実行と検証
        // 失敗はキャッシュされないため、再試行では解決が再実行される。
        const input = createPseudoRandomBytes(64, 41);
        const decoded = await target.decode({ data: await target.encode({ data: input }) });
        expect(decoded).toStrictEqual(input);
        expect(loadSpy).toHaveBeenCalledTimes(2);
      } finally {
        loadSpy.mockRestore();
      }
    } finally {
      vi.restoreAllMocks();
    }
  });

  test("node:zlib の解決に失敗すると decode を UnsupportedRuntimeError で拒否する", async ({
    expect,
  }) => {
    // 準備
    vi.resetModules();

    try {
      const fresh = await import("../src/zstd-node.js");
      const freshErrors = await import("../src/errors.js");
      const freshBridge = await import("../src/_zlib.js");
      const loadSpy = vi
        .spyOn(freshBridge.zlibBridge, "load")
        .mockRejectedValueOnce(new Error("load failure"));
      const target = new fresh.default();

      try {
        // 実行と検証
        await expect(target.decode({ data: new Uint8Array([1]) })).rejects.toThrow(
          freshErrors.UnsupportedRuntimeError,
        );
        expect(loadSpy).toHaveBeenCalledTimes(1);
      } finally {
        loadSpy.mockRestore();
      }
    } finally {
      vi.restoreAllMocks();
    }
  });

  test("zstd 圧縮関数がないと encode を UnsupportedRuntimeError で拒否する", async ({ expect }) => {
    // 準備
    vi.resetModules();

    try {
      const fresh = await import("../src/zstd-node.js");
      const freshErrors = await import("../src/errors.js");
      const freshBridge = await import("../src/_zlib.js");
      const real = await freshBridge.zlibBridge.load();
      const withoutCompress = {
        constants: real.constants,
        zstdDecompressSync: real.zstdDecompressSync,
      } as unknown as typeof import("node:zlib");
      const loadSpy = vi
        .spyOn(freshBridge.zlibBridge, "load")
        .mockResolvedValueOnce(withoutCompress);
      const target = new fresh.default();

      try {
        // 実行と検証
        await expect(target.encode({ data: new Uint8Array([1]) })).rejects.toThrow(
          freshErrors.UnsupportedRuntimeError,
        );
        expect(loadSpy).toHaveBeenCalledTimes(1);
      } finally {
        loadSpy.mockRestore();
      }
    } finally {
      vi.restoreAllMocks();
    }
  });

  test("zstd 展開関数がないと decode を UnsupportedRuntimeError で拒否する", async ({ expect }) => {
    // 準備
    vi.resetModules();

    try {
      const fresh = await import("../src/zstd-node.js");
      const freshErrors = await import("../src/errors.js");
      const freshBridge = await import("../src/_zlib.js");
      const real = await freshBridge.zlibBridge.load();
      const withoutDecompress = {
        constants: real.constants,
        zstdCompressSync: real.zstdCompressSync,
      } as unknown as typeof import("node:zlib");
      const loadSpy = vi
        .spyOn(freshBridge.zlibBridge, "load")
        .mockResolvedValueOnce(withoutDecompress);
      const target = new fresh.default();

      try {
        // 実行と検証
        await expect(target.decode({ data: new Uint8Array([1]) })).rejects.toThrow(
          freshErrors.UnsupportedRuntimeError,
        );
        expect(loadSpy).toHaveBeenCalledTimes(1);
      } finally {
        loadSpy.mockRestore();
      }
    } finally {
      vi.restoreAllMocks();
    }
  });
});

describe("ZstdNodeDecompressError", () => {
  test("既定では英語メッセージを返す", ({ expect }) => {
    // 実行
    const error = new ZstdNodeDecompressError();

    // 検証
    expect(error).toBeInstanceOf(globalThis.Error);
    expect(error.name).toBe("UniKvsZstdNodeDecompressError");
    expect(error.meta).toBeUndefined();
    expect(error.message).toBe("Failed to decompress the zstd data");
  });

  test("cause を保持する", ({ expect }) => {
    // 準備
    const cause = new Error("原因");

    // 実行
    const error = new ZstdNodeDecompressError({ cause });

    // 検証
    expect(error.cause).toBe(cause);
  });

  test("言語設定が日本語なら日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備
    const error = new ZstdNodeDecompressError();

    // 実行
    setLang("ja");

    // 検証
    expect(error.message).toBe("zstd データの展開に失敗しました");
  });
});

describe("ZstdNodeInvalidLevelError", () => {
  test("meta に actual を保持し、既定では英語メッセージを返す", ({ expect }) => {
    // 実行
    const error = new ZstdNodeInvalidLevelError({ actual: 0 });

    // 検証
    expect(error).toBeInstanceOf(globalThis.Error);
    expect(error.name).toBe("UniKvsZstdNodeInvalidLevelError");
    expect(error.meta).toStrictEqual({ actual: 0 });
    expect(error.message).toBe("Invalid zstd compression level: 0");
  });

  test("cause を保持する", ({ expect }) => {
    // 準備
    const cause = new Error("原因");

    // 実行
    const error = new ZstdNodeInvalidLevelError({ actual: 0, cause });

    // 検証
    expect(error.cause).toBe(cause);
  });

  test("言語設定が日本語なら日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備
    const error = new ZstdNodeInvalidLevelError({ actual: 0 });

    // 実行
    setLang("ja");

    // 検証
    expect(error.message).toBe("無効な zstd 圧縮レベル: 0");
  });
});

describe("UnsupportedRuntimeError", () => {
  test("既定では英語メッセージを返す", ({ expect }) => {
    // 実行
    const error = new UnsupportedRuntimeError({ name: "ZstdNode", runtime: "Node.js" });

    // 検証
    expect(error).toBeInstanceOf(globalThis.Error);
    expect(error.name).toBe("UniKvsUnsupportedRuntimeError");
    expect(error.meta).toStrictEqual({ name: "ZstdNode", runtime: "Node.js" });
    expect(error.message).toBe("ZstdNode can only be used in the Node.js runtime");
  });

  test("cause を保持する", ({ expect }) => {
    // 準備
    const cause = new Error("原因");

    // 実行
    const error = new UnsupportedRuntimeError({ name: "ZstdNode", runtime: "Node.js", cause });

    // 検証
    expect(error.cause).toBe(cause);
  });

  test("言語設定が日本語なら日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備
    const error = new UnsupportedRuntimeError({ name: "ZstdNode", runtime: "Node.js" });

    // 実行
    setLang("ja");

    // 検証
    expect(error.message).toBe("ZstdNode は Node.js ランタイムでのみ使用できます");
  });
});

describe("壊れた圧縮データの decode", () => {
  test("圧縮データではないバイト列を ZstdNodeDecompressError で拒否する", async ({ expect }) => {
    // 準備
    const target = new ZstdNode();
    const garbage = createPseudoRandomBytes(64, 21);

    // 実行と検証
    await expect(target.decode({ data: garbage })).rejects.toThrow(ZstdNodeDecompressError);
  });

  test("末尾を欠いたデータを ZstdNodeDecompressError で拒否する", async ({ expect }) => {
    // 準備
    const target = new ZstdNode();
    const encoded = await target.encode({ data: createPseudoRandomBytes(4096, 22) });

    // 実行と検証
    await expect(target.decode({ data: encoded.subarray(0, encoded.length - 4) })).rejects.toThrow(
      ZstdNodeDecompressError,
    );
  });

  test("先頭を壊したデータを ZstdNodeDecompressError で拒否する", async ({ expect }) => {
    // 準備
    // 末尾破壊は検出できない場合があるため、先頭のマジックバイトを壊して検証する。
    const target = new ZstdNode();
    const encoded = await target.encode({ data: createPseudoRandomBytes(4096, 23) });
    const corrupted = encoded.slice();
    corrupted[0] = corrupted[0]! ^ 0xff;

    // 実行と検証
    await expect(target.decode({ data: corrupted })).rejects.toThrow(ZstdNodeDecompressError);
  });
});

describe("範囲外レベルのコンストラクター", () => {
  test("有効な境界 1 と 22 は受け付ける", ({ expect }) => {
    // 実行と検証
    expect(() => new ZstdNode({ level: 1 })).not.toThrow();
    expect(() => new ZstdNode({ level: 22 })).not.toThrow();
  });

  test("無効値は ZstdNodeInvalidLevelError で拒否する", ({ expect }) => {
    // 準備
    // 本ループは拒否区分のみを扱う。有効区分は往復群とオプション節で検証する。
    const invalidValues = [0, 23, -1, -7, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "3", true];

    // 実行と検証
    for (const value of invalidValues) {
      expect(
        () => new ZstdNode({ level: value as unknown as ZstdNodeOptions["level"] }),
        `${String(value)}`,
      ).toThrow(ZstdNodeInvalidLevelError);
    }
  });

  test("meta.actual に指定値をそのまま保持する", ({ expect }) => {
    // 実行と検証
    // 拒否区分の全 9 値で指定値そのまま保持の契約を検証する。
    for (const value of [0, 23, -1, -7, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "3", true]) {
      let thrown: unknown;

      try {
        new ZstdNode({ level: value as unknown as ZstdNodeOptions["level"] });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(ZstdNodeInvalidLevelError);
      expect((thrown as ZstdNodeInvalidLevelError).meta).toStrictEqual({ actual: value });
    }
  });
});
