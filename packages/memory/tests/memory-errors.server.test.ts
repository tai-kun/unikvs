import { describe, test as vitest } from "vitest";

// valibot は @unikvs/core の peerDependency であり @unikvs/memory からは解決できないため、
// サーバーテストに限り core の node_modules を直接参照して言語設定を切り替えます。
import { deleteGlobalConfig, setGlobalConfig } from "../../core/node_modules/valibot/dist/index.js";
import { InvalidChunkTypeError, KeyNotFoundError } from "../src/errors.js";
import Memory from "../src/memory.js";

/**
 * 言語設定をテスト内でのみ変更するフィクスチャーです。
 * 設定した言語はテスト終了後に削除され、ほかのテストに影響しません。
 */
const test = vitest.extend<{ storage: Memory; setLang: (lang: string) => void }>({
  // oxlint-disable-next-line no-empty-pattern
  async storage({}, use) {
    await use(new Memory());
  },
  // oxlint-disable-next-line no-empty-pattern
  async setLang({}, use) {
    await use((lang) => {
      setGlobalConfig({ lang });
    });
    deleteGlobalConfig();
  },
});

describe("エラーメッセージ（日本語）", () => {
  test("KeyNotFoundError は日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備
    setLang("ja");

    // 実行と検証
    expect(new KeyNotFoundError({ key: "foo" }).message).toBe("キー foo が見つかりません");
  });

  test("存在しないキーの read は日本語メッセージの KeyNotFoundError を投げる", ({
    expect,
    setLang,
    storage,
  }) => {
    // 準備
    setLang("ja");

    // 実行と検証
    expect(() => storage.read({ key: "foo" })).toThrow("キー foo が見つかりません");
  });

  test("InvalidChunkTypeError は日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備
    setLang("ja");

    // 実行
    const error = new InvalidChunkTypeError({ key: "foo", chunk: "bar" });

    // 検証
    expect(error.meta.chunkType).toBe("string");
    expect(error.message).toBe(
      'キー "foo" のチャンク型に Uint8Array<ArrayBuffer> を期待しましたが、string を得ました',
    );
  });
});
