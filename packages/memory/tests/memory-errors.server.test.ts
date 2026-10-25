import type { IStorage } from "@unikvs/core";
import { createGetContext } from "@unikvs/testing";
import { setGlobalConfig, deleteGlobalConfig } from "valibot";
import { test as vitest, describe } from "vite-plus/test";

import { KeyNotFoundError, InvalidChunkTypeError } from "../src/errors.js";
import Memory from "../src/memory.js";

/**
 * 言語設定をテスト内でのみ変更するフィクスチャーです。
 * 設定した言語はテスト終了後に削除され、ほかのテストに影響しません。
 */
const test = vitest.extend<{
  setLang: (lang: string) => void;
  storage: Memory;
}>({
  async setLang({}, use) {
    await use((lang) => {
      setGlobalConfig({ lang });
    });
    deleteGlobalConfig();
  },
  async storage({}, use) {
    await use(new Memory());
  },
});
describe("エラーメッセージ（日本語）", () => {
  test("KeyNotFoundError は日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備：
    setLang("ja");

    // 実行と検証：
    expect(new KeyNotFoundError({ key: "foo" }).message).toBe("キー foo が見つかりません");
  });

  test("存在しないキーの read は日本語メッセージの KeyNotFoundError を投げる", ({
    expect,
    setLang,
    storage,
  }) => {
    // 準備：
    setLang("ja");

    // 実行と検証：
    expect(() => storage.read(createGetContext("foo") as IStorage.ReadContext)).toThrow(
      "キー foo が見つかりません",
    );
  });

  test("InvalidChunkTypeError は日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備：
    setLang("ja");

    // 実行：
    const error = new InvalidChunkTypeError({
      key: "foo",
      chunk: "bar",
    });

    // 検証：
    expect(error.meta.chunkType).toBe("string");
    expect(error.message).toBe(
      'キー "foo" のチャンク型に Uint8Array<ArrayBuffer> を期待しましたが、string を得ました',
    );
  });
});
