import { deleteGlobalConfig, setGlobalConfig } from "valibot";
import { describe, test as vitest } from "vitest";

import { SoftDeleteInvalidRetentionError, TombstoneNotFoundError } from "../src/errors.js";

/**
 * 言語設定をテスト内でのみ変更するフィクスチャーです。
 * テスト終了後にグローバル設定を削除し、ほかのテストに影響しません。
 */
const test = vitest.extend<{ setLang: (lang: string) => void }>({
  // oxlint-disable-next-line no-empty-pattern
  async setLang({}, use) {
    await use((lang) => {
      setGlobalConfig({ lang });
    });
    deleteGlobalConfig();
  },
});

describe("TombstoneNotFoundError の国際化", () => {
  test("既定では英語メッセージになる", ({ expect }) => {
    // 準備
    const error = new TombstoneNotFoundError({ key: "k1" });

    // 実行と検証
    expect(error.message).toBe("Tombstone not found for key: k1");
  });

  test("ja を設定すると日本語メッセージになる", ({ expect, setLang }) => {
    // 準備
    const error = new TombstoneNotFoundError({ key: "k1" });

    // 実行と検証
    setLang("ja");
    expect(error.message).toBe("キー k1 のトゥームストーンが見つかりません");

    setLang("en");
    expect(error.message).toBe("Tombstone not found for key: k1");
  });
});

describe("SoftDeleteInvalidRetentionError の国際化", () => {
  test("既定では英語メッセージになる", ({ expect }) => {
    // 準備
    const error = new SoftDeleteInvalidRetentionError({ actual: -1 });

    // 実行と検証
    expect(error.message).toBe(
      "Invalid retentionMs -1: retentionMs must be a non-negative finite number of milliseconds.",
    );
  });

  test("ja を設定すると日本語メッセージになる", ({ expect, setLang }) => {
    // 準備
    const error = new SoftDeleteInvalidRetentionError({ actual: -1 });

    // 実行と検証
    setLang("ja");
    expect(error.message).toBe(
      "無効な retentionMs -1 が指定されました。retentionMs には 0 以上の有限な数値 (ミリ秒) を指定してください。",
    );

    setLang("en");
    expect(error.message).toBe(
      "Invalid retentionMs -1: retentionMs must be a non-negative finite number of milliseconds.",
    );
  });
});
