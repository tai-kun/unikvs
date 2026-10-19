import { deleteGlobalConfig, setGlobalConfig } from "valibot";
import { describe, test as vitest } from "vitest";

import {
  InvalidBindingError,
  InvalidKeyPrefixError,
  InvalidTtlSecondsError,
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
  test("InvalidBindingError は日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備
    setLang("ja");

    // 実行と検証
    expect(new InvalidBindingError({ actual: null }).message).toBe(
      "binding は get/put/delete/list メソッドを持つ KVNamespace 相当のオブジェクトでなければなりません",
    );
  });

  test("InvalidKeyPrefixError は日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備
    setLang("ja");

    // 実行と検証
    expect(new InvalidKeyPrefixError({ actual: 42 }).message).toBe(
      "keyPrefix は文字列でなければなりません。受け取った値: 42",
    );
  });

  test("InvalidTtlSecondsError は日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備
    setLang("ja");

    // 実行と検証
    expect(new InvalidTtlSecondsError({ actual: 0 }).message).toBe(
      "ttlSeconds は正の整数または undefined でなければなりません。受け取った値: 0",
    );
  });
});

describe("エラーメッセージ（英語）", () => {
  test("InvalidBindingError は英語メッセージを返す", ({ expect }) => {
    // 実行と検証
    expect(new InvalidBindingError({ actual: null }).message).toBe(
      "Expected binding to be a KVNamespace-like object with get/put/delete/list methods",
    );
  });

  test("InvalidKeyPrefixError は英語メッセージを返す", ({ expect }) => {
    // 実行と検証
    expect(new InvalidKeyPrefixError({ actual: 42 }).message).toBe(
      "Expected keyPrefix to be a string, but got 42",
    );
  });

  test("InvalidTtlSecondsError は英語メッセージを返す", ({ expect }) => {
    // 実行と検証
    expect(new InvalidTtlSecondsError({ actual: 0 }).message).toBe(
      "Expected ttlSeconds to be a positive integer or undefined, but got 0",
    );
  });
});
