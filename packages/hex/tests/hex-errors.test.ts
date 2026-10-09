import { describe, test as vitest } from "vitest";

import { deleteGlobalConfig, setGlobalConfig } from "../../core/node_modules/valibot/dist/index.js";
import { HexDecodeError } from "../src/errors.js";

/**
 * 言語設定をテスト内でのみ変更するためのフィクスチャーです。
 * 設定した言語はテスト終了後に削除され、ほかのテストに影響しません。
 *
 * valibot は hex の直接依存ではないため、@unikvs/core が使う実体を
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

describe("HexDecodeError", () => {
  test("既定では英語メッセージを返す", ({ expect }) => {
    // 実行
    const error = new HexDecodeError();

    // 検証
    expect(error).toBeInstanceOf(globalThis.Error);
    expect(error.name).toBe("UniKvsHexDecodeError");
    expect(error.meta).toBeUndefined();
    expect(error.message).toBe("Failed to decode the hex data");
  });

  test("cause を保持する", ({ expect }) => {
    // 準備
    const cause = new Error("原因");

    // 実行
    const error = new HexDecodeError({ cause });

    // 検証
    expect(error.cause).toBe(cause);
  });

  test("言語設定が日本語なら日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備
    const error = new HexDecodeError();

    // 実行
    setLang("ja");

    // 検証
    expect(error.message).toBe("hex データのデコードに失敗しました");
  });
});
