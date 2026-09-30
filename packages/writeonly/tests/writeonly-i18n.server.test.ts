import { describe, test as vitest } from "vitest";

import { deleteGlobalConfig, setGlobalConfig } from "../../core/node_modules/valibot/dist/index.js";
import { KeyNotFoundError } from "../src/errors.js";
import WriteOnly from "../src/write-only.js";
import { RecordingStorage } from "./_helpers.js";

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

describe("KeyNotFoundError の国際化 (server)", () => {
  test("ja を設定すると read のエラーが日本語になる", ({ expect, setLang }) => {
    // 準備
    const storage = new WriteOnly(new RecordingStorage());
    setLang("ja");

    // 実行と検証
    expect(() => storage.read({ key: "k1" })).toThrow("キー k1 が見つかりません");
  });

  test("ja を設定すると getReadable のエラーが日本語になる", ({ expect, setLang }) => {
    // 準備
    const storage = new WriteOnly(new RecordingStorage());
    setLang("ja");

    // 実行と検証
    expect(() => storage.getReadable({ key: "k1" })).toThrow("キー k1 が見つかりません");
  });

  test("en に戻すと英語メッセージになる", ({ expect, setLang }) => {
    // 準備
    const error = new KeyNotFoundError({ key: "k1" });

    // 実行と検証
    setLang("ja");
    expect(error.message).toBe("キー k1 が見つかりません");

    setLang("en");
    expect(error.message).toBe("Key not found: k1");
  });

  test("日本語メッセージでもキーは meta にそのまま保持される", ({ expect, setLang }) => {
    // 準備
    const storage = new WriteOnly(new RecordingStorage());
    setLang("ja");
    let error: unknown;

    // 実行
    try {
      storage.read({ key: "キー🔑" });
    } catch (ex) {
      error = ex;
    }

    // 検証
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect(error).toMatchObject({ meta: { key: "キー🔑" } });
    expect((error as KeyNotFoundError).message).toBe("キー キー🔑 が見つかりません");
  });
});
