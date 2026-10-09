import { describe, test as vitest } from "vitest";

import { deleteGlobalConfig, setGlobalConfig } from "../../core/node_modules/valibot/dist/index.js";
import { Base64DecodeError } from "../src/errors.js";

/**
 * 言語設定をテスト内でのみ変更するためのフィクスチャーです。
 * 設定した言語はテスト終了後に削除され、ほかのテストに影響しません。
 *
 * valibot は base64 の直接依存ではないため、@unikvs/core が使う実体を
 * 明示的に参照しています。ブラウザーでモジュール実体が分かれないよう、
 * vitest.client.ts の optimizeDeps から valibot を除外しています。
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

describe("Base64DecodeError", () => {
  test("既定では英語メッセージを返す", ({ expect }) => {
    // 実行
    const error = new Base64DecodeError();

    // 検証
    expect(error).toBeInstanceOf(globalThis.Error);
    expect(error.name).toBe("UniKvsBase64DecodeError");
    expect(error.meta).toBeUndefined();
    expect(error.message).toBe("Failed to decode the base64 data");
  });

  test("cause を保持する", ({ expect }) => {
    // 準備
    const cause = new Error("原因");

    // 実行
    const error = new Base64DecodeError({ cause });

    // 検証
    expect(error.cause).toBe(cause);
  });

  test("言語設定が日本語なら日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備
    const error = new Base64DecodeError();

    // 実行
    setLang("ja");

    // 検証
    expect(error.message).toBe("base64 データのデコードに失敗しました");
  });
});
