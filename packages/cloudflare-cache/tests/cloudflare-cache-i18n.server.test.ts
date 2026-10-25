import { setGlobalConfig, deleteGlobalConfig } from "valibot";
import { test as vitest, describe } from "vite-plus/test";

import {
  InvalidKeyError,
  KeyNotFoundError,
  InvalidOriginError,
  CacheOperationError,
  InvalidChunkTypeError,
  ClearNotSupportedError,
  CacheBindingNotFoundError,
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
  test("InvalidOriginError は日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備：
    setLang("ja");

    // 実行と検証：
    expect(new InvalidOriginError({ actual: "x" }).message).toBe(
      "`origin` はクエリー・フラグメントなしの絶対 URL でなければなりません。受け取った値: x",
    );
  });

  test("InvalidKeyError は日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備：
    setLang("ja");

    // 実行と検証：
    expect(new InvalidKeyError({ key: "k" }).message).toBe(
      'キー "k" を URL パスセグメントとして符号化できませんでした',
    );
  });

  test("CacheBindingNotFoundError は日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備：
    setLang("ja");

    // 実行と検証：
    expect(new CacheBindingNotFoundError({ property: "caches.default" }).message).toBe(
      "Cache binding が見つかりません。`cache` オプションを渡すか、caches.default が存在するランタイムで実行してください。",
    );
  });

  test("CacheOperationError は日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備：
    setLang("ja");

    // 実行と検証：
    expect(
      new CacheOperationError({
        key: "k",
        operation: "match",
      }).message,
    ).toBe('Cache の match に失敗しました (キー "k")');
    expect(
      new CacheOperationError({
        key: undefined,
        operation: "delete",
      }).message,
    ).toBe("Cache の delete に失敗しました");
  });

  test("ClearNotSupportedError は日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備：
    setLang("ja");

    // 実行と検証：
    expect(new ClearNotSupportedError().message).toBe(
      "Cache API はキーの列挙に対応していないため、clear には対応していません。キーを 1 件ずつ削除してください。",
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

  test("KeyNotFoundError は日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備：
    setLang("ja");

    // 実行と検証：
    expect(new KeyNotFoundError({ key: "foo" }).message).toBe("キー foo が見つかりません");
  });
});
