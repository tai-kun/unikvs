import { describe, test as vitest } from "vitest";

// valibot は @unikvs/core の peerDependency であり @unikvs/session-storage からは解決できないため、
// サーバーテストに限り core の node_modules を直接参照して言語設定を切り替えます。
import { deleteGlobalConfig, setGlobalConfig } from "../../core/node_modules/valibot/dist/index.js";
import {
  ClearWithoutPrefixNotAllowedError,
  KeyNotFoundError,
  SessionStorageNotAvailableError,
} from "../src/errors.js";

/**
 * 言語設定をテスト内でのみ変更するフィクスチャーです。
 * 設定した言語はテスト終了後に削除され、ほかのテストに影響しません。
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

describe("エラーメッセージ（日本語）", () => {
  test("ClearWithoutPrefixNotAllowedError は日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備
    setLang("ja");

    // 実行と検証
    expect(new ClearWithoutPrefixNotAllowedError().message).toBe(
      "空の keyPrefix での clear を拒否します。sessionStorage 全体を削除するためです。空でない keyPrefix を設定するか、allowClearWithoutPrefix: true を指定してください。",
    );
  });

  test("SessionStorageNotAvailableError は日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備
    setLang("ja");

    // 実行と検証
    expect(new SessionStorageNotAvailableError().message).toBe(
      "この環境では sessionStorage が利用できません。options.storage で Storage を注入してください。",
    );
  });

  test("KeyNotFoundError は日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備
    setLang("ja");

    // 実行と検証
    expect(new KeyNotFoundError({ key: "foo" }).message).toBe("キー foo が見つかりません");
  });
});
