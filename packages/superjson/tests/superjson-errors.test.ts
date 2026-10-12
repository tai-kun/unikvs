import { deleteGlobalConfig, setGlobalConfig } from "valibot";
import { describe, test as vitest } from "vitest";

import { SuperjsonUnsupportedValueError } from "../src/errors.js";

/**
 * 言語設定をテスト内でのみ変更するためのフィクスチャーです。
 * 設定した言語はテスト終了後に削除され、ほかのテストに影響しません。
 *
 * valibot は superjson の直接依存ではないため、@unikvs/core が使う実体を
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

describe("SuperjsonUnsupportedValueError", () => {
  test("meta に type を保持し、既定では英語メッセージを返す", ({ expect }) => {
    // 準備と実行
    const error = new SuperjsonUnsupportedValueError({ type: "function" });

    // 検証
    expect(error).toBeInstanceOf(globalThis.Error);
    expect(error.name).toBe("UniKvsSuperjsonUnsupportedValueError");
    expect(error.meta).toStrictEqual({ type: "function" });
    expect(error.message).toBe("Unsupported value type: function");
  });

  test("言語設定が日本語なら日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備
    const error = new SuperjsonUnsupportedValueError({ type: "symbol" });

    // 実行
    setLang("ja");

    // 検証
    expect(error.message).toBe("サポートされていない値の型: symbol");
  });
});
