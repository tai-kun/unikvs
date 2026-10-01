import { InvalidUsageErrorBase } from "@unikvs/core";
import { describe, test as vitest } from "vitest";

import { deleteGlobalConfig, setGlobalConfig } from "../../core/node_modules/valibot/dist/index.js";
import { UnsupportedRuntimeError } from "../src/errors.js";

/**
 * 言語設定をテスト内でのみ変更するためのフィクスチャーです。
 * テスト終了後にグローバル設定を削除し、ほかのテストに影響しません。
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

describe("UnsupportedRuntimeError の国際化 (server)", () => {
  test("既定では英語メッセージと name を持つ", ({ expect }) => {
    // 準備
    const error = new UnsupportedRuntimeError();

    // 実行と検証
    expect(error).toBeInstanceOf(InvalidUsageErrorBase);
    expect(error.name).toBe("BunFsUnsupportedRuntimeError");
    expect(error.message).toBe("BunFs can only be used in the Bun runtime");
  });

  test("ja を設定すると日本語メッセージになる", ({ expect, setLang }) => {
    // 準備
    const error = new UnsupportedRuntimeError();

    // 実行
    setLang("ja");

    // 検証
    expect(error.message).toBe("BunFs は Bun ランタイムでのみ使用できます");
  });

  test("en に戻すと英語メッセージに戻る", ({ expect, setLang }) => {
    // 準備
    const error = new UnsupportedRuntimeError();

    // 実行と検証
    setLang("ja");
    expect(error.message).toBe("BunFs は Bun ランタイムでのみ使用できます");

    setLang("en");
    expect(error.message).toBe("BunFs can only be used in the Bun runtime");
  });
});
