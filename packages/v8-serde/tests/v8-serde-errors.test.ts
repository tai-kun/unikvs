import type { IMiddleware } from "@unikvs/core";
import {
  captureRejection,
  createDecodeContext,
  createEncodeContext,
  createNext,
  createOpenContext,
} from "@unikvs/testing";
import { deleteGlobalConfig, setGlobalConfig } from "valibot";
import { describe, test as vitest, vi } from "vitest";

import { UnsupportedRuntimeError, V8SerdeDecodeError, V8SerdeEncodeError } from "../src/errors.js";

/**
 * 言語設定をテスト内でのみ変更するためのフィクスチャーです。
 * 設定した言語はテスト終了後に削除され、ほかのテストに影響しません。
 *
 * valibot は v8-serde の直接依存ではないため、@unikvs/core が使う実体を
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
// 解決失敗の検証はモジュールを再読み込みした新鮮な実体で行う。
// 静的 import の実体とはキャッシュを共有しないため、後続の往復群に影響しない。
describe("対応しない実行環境", () => {
  test("node:v8 の解決に失敗すると open を UnsupportedRuntimeError で拒否する", async ({
    expect,
    signal,
  }) => {
    // 準備
    vi.resetModules();

    try {
      const fresh = await import("../src/v8-serde.js");
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
        ).toStrictEqual({ name: "V8Serde", runtime: "Node.js" });
        expect(target.isOpen).toBe(false);

        // 実行と検証
        // 失敗はキャッシュされないため、再試行では解決が再実行される。
        await target.open(createOpenContext({ signal }) as IMiddleware.OpenContext);
        const input = { value: 1 };
        const encodeContext = createEncodeContext(input);
        await target.encode(
          encodeContext as IMiddleware.EncodeContext<unknown, Uint8Array<ArrayBuffer>>,
          createNext(),
        );
        const decodeContext = createDecodeContext(encodeContext.destination);
        await target.decode(
          decodeContext as IMiddleware.DecodeContext<Uint8Array<ArrayBuffer>, unknown>,
          createNext(),
        );
        const decoded = decodeContext.destination;
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

describe("V8SerdeEncodeError", () => {
  test("既定では英語メッセージを返す", ({ expect }) => {
    // 実行
    const error = new V8SerdeEncodeError();

    // 検証
    expect(error).toBeInstanceOf(globalThis.Error);
    expect(error.name).toBe("UniKvsV8SerdeEncodeError");
    expect(error.meta).toBeUndefined();
    expect(error.message).toBe("Failed to encode a value with v8.serialize");
  });

  test("cause を保持する", ({ expect }) => {
    // 準備
    const cause = new Error("原因");

    // 実行
    const error = new V8SerdeEncodeError({ cause });

    // 検証
    expect(error.cause).toBe(cause);
  });

  test("言語設定が日本語なら日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備
    const error = new V8SerdeEncodeError();

    // 実行
    setLang("ja");

    // 検証
    expect(error.message).toBe("値の v8.serialize エンコードに失敗しました");
  });
});

describe("V8SerdeDecodeError", () => {
  test("既定では英語メッセージを返す", ({ expect }) => {
    // 実行
    const error = new V8SerdeDecodeError();

    // 検証
    expect(error).toBeInstanceOf(globalThis.Error);
    expect(error.name).toBe("UniKvsV8SerdeDecodeError");
    expect(error.meta).toBeUndefined();
    expect(error.message).toBe("Failed to decode the data with v8.deserialize");
  });

  test("cause を保持する", ({ expect }) => {
    // 準備
    const cause = new Error("原因");

    // 実行
    const error = new V8SerdeDecodeError({ cause });

    // 検証
    expect(error.cause).toBe(cause);
  });

  test("言語設定が日本語なら日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備
    const error = new V8SerdeDecodeError();

    // 実行
    setLang("ja");

    // 検証
    expect(error.message).toBe("データの v8.deserialize デコードに失敗しました");
  });
});

describe("UnsupportedRuntimeError", () => {
  test("既定では英語メッセージを返す", ({ expect }) => {
    // 実行
    const error = new UnsupportedRuntimeError({ name: "V8Serde", runtime: "Node.js" });

    // 検証
    expect(error).toBeInstanceOf(globalThis.Error);
    expect(error.name).toBe("UniKvsUnsupportedRuntimeError");
    expect(error.meta).toStrictEqual({ name: "V8Serde", runtime: "Node.js" });
    expect(error.message).toBe("V8Serde can only be used in the Node.js runtime");
  });

  test("cause を保持する", ({ expect }) => {
    // 準備
    const cause = new Error("原因");

    // 実行
    const error = new UnsupportedRuntimeError({ name: "V8Serde", runtime: "Node.js", cause });

    // 検証
    expect(error.cause).toBe(cause);
  });

  test("言語設定が日本語なら日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備
    const error = new UnsupportedRuntimeError({ name: "V8Serde", runtime: "Node.js" });

    // 実行
    setLang("ja");

    // 検証
    expect(error.message).toBe("V8Serde は Node.js ランタイムでのみ使用できます");
  });
});
