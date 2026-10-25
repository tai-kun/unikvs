import { setGlobalConfig, deleteGlobalConfig } from "valibot";
import { test as vitest, describe } from "vite-plus/test";

import Base64Url, { type Base64UrlOptions } from "../src/base64url.js";
import { Base64UrlDecodeError, Base64UrlInvalidPaddingError } from "../src/errors.js";

/**
 * 言語設定をテスト内でのみ変更するためのフィクスチャーです。
 * 設定した言語はテスト終了後に削除され、ほかのテストに影響しません。
 *
 * valibot は base64url の直接依存ではないため、@unikvs/core が使う実体を差し替えます。
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
describe("Base64UrlDecodeError", () => {
  test("既定では英語メッセージを返す", ({ expect }) => {
    // 実行：
    const error = new Base64UrlDecodeError();

    // 検証：
    expect(error).toBeInstanceOf(globalThis.Error);
    expect(error.name).toBe("UniKvsBase64UrlDecodeError");
    expect(error.meta).toBeUndefined();
    expect(error.message).toBe("Failed to decode the base64url data");
  });

  test("cause を保持する", ({ expect }) => {
    // 準備：
    const cause = new Error("原因");

    // 実行：
    const error = new Base64UrlDecodeError({ cause });

    // 検証：
    expect(error.cause).toBe(cause);
  });

  test("言語設定が日本語なら日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備：
    const error = new Base64UrlDecodeError();

    // 実行：
    setLang("ja");

    // 検証：
    expect(error.message).toBe("base64url データのデコードに失敗しました");
  });
});
describe("Base64UrlInvalidPaddingError", () => {
  test("meta に actual を保持し、既定では英語メッセージを返す", ({ expect }) => {
    // 実行：
    const error = new Base64UrlInvalidPaddingError({ actual: null });

    // 検証：
    expect(error).toBeInstanceOf(globalThis.Error);
    expect(error.name).toBe("UniKvsBase64UrlInvalidPaddingError");
    expect(error.meta).toStrictEqual({ actual: null });
    expect(error.message).toBe("Invalid base64url padding option: null");
  });

  test("cause を保持する", ({ expect }) => {
    // 準備：
    const cause = new Error("原因");

    // 実行：
    const error = new Base64UrlInvalidPaddingError({
      cause,
      actual: null,
    });

    // 検証：
    expect(error.cause).toBe(cause);
  });

  test("言語設定が日本語なら日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備：
    const error = new Base64UrlInvalidPaddingError({ actual: null });

    // 実行：
    setLang("ja");

    // 検証：
    expect(error.message).toBe("無効な base64url padding オプション: null");
  });
});
describe("不正な padding のコンストラクター", () => {
  test("無効値は Base64UrlInvalidPaddingError で拒否する", ({ expect }) => {
    // 準備：
    // null は既定値に吸収されず無効値として拒否される。
    const invalidValues = [null, 1, "true", 0];

    // 実行と検証：
    for (const value of invalidValues) {
      expect(
        () => new Base64Url({ padding: value as unknown as Base64UrlOptions["padding"] }),
        String(value),
      ).toThrow(Base64UrlInvalidPaddingError);
    }
  });

  test("meta.actual に指定値をそのまま保持する", ({ expect }) => {
    // 実行と検証：
    for (const value of [null, 1, "true", 0]) {
      let thrown: unknown;

      try {
        thrown = new Base64Url({ padding: value as unknown as Base64UrlOptions["padding"] });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(Base64UrlInvalidPaddingError);
      expect((thrown as Base64UrlInvalidPaddingError).meta).toStrictEqual({ actual: value });
    }
  });
});
