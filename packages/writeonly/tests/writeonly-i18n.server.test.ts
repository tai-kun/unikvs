import { Variables } from "@unikvs/core";
import { deleteGlobalConfig, setGlobalConfig } from "valibot";
import { describe, test as vitest } from "vitest";

import {
  KeyNotFoundError,
  WriteOnlyClearNotAllowedError,
  WriteOnlyDeleteNotAllowedError,
} from "../src/errors.js";
import WriteOnly from "../src/write-only.js";

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

describe("WriteOnlyDeleteNotAllowedError の国際化 (server)", () => {
  test("既定では英語メッセージになる", ({ expect }) => {
    // 準備
    const error = new WriteOnlyDeleteNotAllowedError({ key: "k1" });

    // 実行と検証
    expect(error.message).toBe('WriteOnly.delete with allowDelete false cannot delete key "k1".');
  });

  test("ja を設定すると onDelete のエラーが日本語になる", ({ expect, setLang }) => {
    // 準備
    const transformer = new WriteOnly();
    setLang("ja");

    // 実行と検証
    expect(() => transformer.onDelete({ key: "k1" })).toThrow(
      'WriteOnly.delete は allowDelete が false のためキー "k1" を削除できません。',
    );
  });

  test("en に戻すと英語メッセージになる", ({ expect, setLang }) => {
    // 準備
    const error = new WriteOnlyDeleteNotAllowedError({ key: "k1" });

    // 実行と検証
    setLang("ja");
    expect(error.message).toBe(
      'WriteOnly.delete は allowDelete が false のためキー "k1" を削除できません。',
    );

    setLang("en");
    expect(error.message).toBe('WriteOnly.delete with allowDelete false cannot delete key "k1".');
  });

  test("日本語メッセージでもキーは meta にそのまま保持される", ({ expect, setLang }) => {
    // 準備
    const transformer = new WriteOnly();
    setLang("ja");
    let error: unknown;

    // 実行
    try {
      transformer.onDelete({ key: "キー🔑" });
    } catch (ex) {
      error = ex;
    }

    // 検証
    expect(error).toBeInstanceOf(WriteOnlyDeleteNotAllowedError);
    expect(error).toMatchObject({ meta: { key: "キー🔑" } });
    expect((error as WriteOnlyDeleteNotAllowedError).message).toBe(
      'WriteOnly.delete は allowDelete が false のためキー "キー🔑" を削除できません。',
    );
  });
});

describe("WriteOnlyClearNotAllowedError の国際化 (server)", () => {
  test("既定では英語メッセージになる", ({ expect }) => {
    // 準備
    const error = new WriteOnlyClearNotAllowedError();

    // 実行と検証
    expect(error.message).toBe("WriteOnly.clear with allowDelete false cannot delete all data.");
  });

  test("ja を設定すると onClear のエラーが日本語になる", ({ expect, setLang }) => {
    // 準備
    const transformer = new WriteOnly();
    setLang("ja");

    // 実行と検証
    expect(() => transformer.onClear()).toThrow(
      "WriteOnly.clear は allowDelete が false のため全件を削除できません。",
    );
  });

  test("en に戻すと英語メッセージになる", ({ expect, setLang }) => {
    // 準備
    const error = new WriteOnlyClearNotAllowedError();

    // 実行と検証
    setLang("ja");
    expect(error.message).toBe(
      "WriteOnly.clear は allowDelete が false のため全件を削除できません。",
    );

    setLang("en");
    expect(error.message).toBe("WriteOnly.clear with allowDelete false cannot delete all data.");
  });
});

describe("KeyNotFoundError の国際化 (server)", () => {
  test("ja を設定すると decode のエラーが日本語になる", ({ expect, setLang }) => {
    // 準備
    const transformer = new WriteOnly();
    const vars = new Variables({ "unikvs:key": "k1" });
    setLang("ja");

    // 実行と検証
    expect(() => transformer.decode({ vars, data: "v1" })).toThrow("キー k1 が見つかりません");
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
    const transformer = new WriteOnly();
    const vars = new Variables({ "unikvs:key": "キー🔑" });
    setLang("ja");
    let error: unknown;

    // 実行
    try {
      transformer.decode({ vars, data: "v1" });
    } catch (ex) {
      error = ex;
    }

    // 検証
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect(error).toMatchObject({ meta: { key: "キー🔑" } });
    expect((error as KeyNotFoundError).message).toBe("キー キー🔑 が見つかりません");
  });
});
