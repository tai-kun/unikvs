import { setGlobalConfig, deleteGlobalConfig } from "valibot";
import { test as vitest, describe } from "vite-plus/test";

import Base64, { type Base64Options } from "../src/base64.js";
import { Base64DecodeError, Base64InvalidPaddingError } from "../src/errors.js";

/**
 * 言語設定をテスト内でのみ変更するためのフィクスチャーです。
 * 設定した言語はテスト終了後に削除され、ほかのテストに影響しません。
 *
 * valibot は base64 の直接依存ではないため、@unikvs/core が使う実体を差し替えます。
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
describe("Base64DecodeError", () => {
  test("既定では英語メッセージを返す", ({ expect }) => {
    // 実行：
    const error = new Base64DecodeError();

    // 検証：
    expect(error).toBeInstanceOf(globalThis.Error);
    expect(error.name).toBe("UniKvsBase64DecodeError");
    expect(error.meta).toBeUndefined();
    expect(error.message).toBe("Failed to decode the base64 data");
  });

  test("cause を保持する", ({ expect }) => {
    // 準備：
    const cause = new Error("原因");

    // 実行：
    const error = new Base64DecodeError({ cause });

    // 検証：
    expect(error.cause).toBe(cause);
  });

  test("言語設定が日本語なら日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備：
    const error = new Base64DecodeError();

    // 実行：
    setLang("ja");

    // 検証：
    expect(error.message).toBe("base64 データのデコードに失敗しました");
  });
});
describe("Base64InvalidPaddingError", () => {
  test("meta に actual を保持し、既定では英語メッセージを返す", ({ expect }) => {
    // 実行：
    const error = new Base64InvalidPaddingError({ actual: null });

    // 検証：
    expect(error).toBeInstanceOf(globalThis.Error);
    expect(error.name).toBe("UniKvsBase64InvalidPaddingError");
    expect(error.meta).toStrictEqual({ actual: null });
    expect(error.message).toBe("Invalid base64 padding option: null");
  });

  test("cause を保持する", ({ expect }) => {
    // 準備：
    const cause = new Error("原因");

    // 実行：
    const error = new Base64InvalidPaddingError({
      cause,
      actual: null,
    });

    // 検証：
    expect(error.cause).toBe(cause);
  });

  test("言語設定が日本語なら日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備：
    const error = new Base64InvalidPaddingError({ actual: null });

    // 実行：
    setLang("ja");

    // 検証：
    expect(error.message).toBe("無効な base64 padding オプション: null");
  });
});
describe("不正な padding のコンストラクター", () => {
  test("無効値は Base64InvalidPaddingError で拒否する", ({ expect }) => {
    // 準備：
    // null は既定値に吸収されず無効値として拒否される。
    const invalidValues = [null, 1, "true", 0];

    // 実行と検証：
    for (const value of invalidValues) {
      expect(
        () => new Base64({ padding: value as unknown as Base64Options["padding"] }),
        String(value),
      ).toThrow(Base64InvalidPaddingError);
    }
  });

  test("meta.actual に指定値をそのまま保持する", ({ expect }) => {
    // 実行と検証：
    for (const value of [null, 1, "true", 0]) {
      let thrown: unknown;

      try {
        thrown = new Base64({ padding: value as unknown as Base64Options["padding"] });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(Base64InvalidPaddingError);
      expect((thrown as Base64InvalidPaddingError).meta).toStrictEqual({ actual: value });
    }
  });
});
