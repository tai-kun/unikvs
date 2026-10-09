import { describe, test as vitest } from "vitest";

import { deleteGlobalConfig, setGlobalConfig } from "../../core/node_modules/valibot/dist/index.js";
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
