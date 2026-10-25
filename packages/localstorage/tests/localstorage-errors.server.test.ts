import { setGlobalConfig, deleteGlobalConfig } from "valibot";
import { test as vitest, describe } from "vite-plus/test";

import {
  KeyNotFoundError,
  LocalStorageNotAvailableError,
  ClearWithoutPrefixNotAllowedError,
} from "../src/errors.js";

/**
 * 言語設定をテスト内でのみ変更するフィクスチャーです。
 * 設定した言語はテスト終了後に削除され、ほかのテストに影響しません。
 */
const test = vitest.extend<{ setLang: (lang: string) => void }>({
  async setLang({}, use) {
    await use((lang) => {
      setGlobalConfig({ lang });
    });
    deleteGlobalConfig();
  },
});
describe("エラーメッセージ（日本語）", () => {
  test("ClearWithoutPrefixNotAllowedError は日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備：
    setLang("ja");

    // 実行と検証：
    expect(new ClearWithoutPrefixNotAllowedError().message).toBe(
      "空の keyPrefix での clear を拒否します。localStorage 全体を削除するためです。空でない keyPrefix を設定するか、allowClearWithoutPrefix: true を指定してください。",
    );
  });

  test("LocalStorageNotAvailableError は日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備：
    setLang("ja");

    // 実行と検証：
    expect(new LocalStorageNotAvailableError().message).toBe(
      "この環境では localStorage が利用できません。options.storage で Storage を注入してください。",
    );
  });

  test("KeyNotFoundError は日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備：
    setLang("ja");

    // 実行と検証：
    expect(new KeyNotFoundError({ key: "foo" }).message).toBe("キー foo が見つかりません");
  });
});
