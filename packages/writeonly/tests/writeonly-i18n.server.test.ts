import type { IMiddleware } from "@unikvs/core";
import {
  createNext,
  createClearContext,
  createDecodeContext,
  createDeleteContext,
} from "@unikvs/testing";
import { setGlobalConfig, deleteGlobalConfig } from "valibot";
import { test as vitest, describe } from "vite-plus/test";

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
  async setLang({}, use) {
    await use((lang) => {
      setGlobalConfig({ lang });
    });
    deleteGlobalConfig();
  },
});
describe("WriteOnlyDeleteNotAllowedError の国際化 (server)", () => {
  test("既定では英語メッセージになる", ({ expect }) => {
    // 準備：
    const error = new WriteOnlyDeleteNotAllowedError({ key: "k1" });

    // 実行と検証：
    expect(error.message).toBe('WriteOnly.delete with allowDelete false cannot delete key "k1".');
  });

  test("ja を設定すると use のエラーが日本語になる", async ({ expect, setLang }) => {
    // 準備：
    const transformer = new WriteOnly();

    setLang("ja");

    // 実行と検証：
    await expect(
      transformer.use(createDeleteContext("k1") as IMiddleware.UseContext, createNext()),
    ).rejects.toThrow(
      'WriteOnly.delete は allowDelete が false のためキー "k1" を削除できません。',
    );
  });

  test("en に戻すと英語メッセージになる", ({ expect, setLang }) => {
    // 準備：
    const error = new WriteOnlyDeleteNotAllowedError({ key: "k1" });

    // 実行と検証：
    setLang("ja");
    expect(error.message).toBe(
      'WriteOnly.delete は allowDelete が false のためキー "k1" を削除できません。',
    );

    setLang("en");
    expect(error.message).toBe('WriteOnly.delete with allowDelete false cannot delete key "k1".');
  });

  test("日本語メッセージでもキーは meta にそのまま保持される", async ({ expect, setLang }) => {
    // 準備：
    const transformer = new WriteOnly();

    setLang("ja");

    // 実行：
    let error: unknown;

    try {
      await transformer.use(createDeleteContext("キー🔑") as IMiddleware.UseContext, createNext());
    } catch (ex) {
      error = ex;
    }

    // 検証：
    expect(error).toBeInstanceOf(WriteOnlyDeleteNotAllowedError);
    expect(error).toMatchObject({ meta: { key: "キー🔑" } });
    expect((error as WriteOnlyDeleteNotAllowedError).message).toBe(
      'WriteOnly.delete は allowDelete が false のためキー "キー🔑" を削除できません。',
    );
  });
});
describe("WriteOnlyClearNotAllowedError の国際化 (server)", () => {
  test("既定では英語メッセージになる", ({ expect }) => {
    // 準備：
    const error = new WriteOnlyClearNotAllowedError();

    // 実行と検証：
    expect(error.message).toBe("WriteOnly.clear with allowDelete false cannot delete all data.");
  });

  test("ja を設定すると use のエラーが日本語になる", async ({ expect, setLang }) => {
    // 準備：
    const transformer = new WriteOnly();

    setLang("ja");

    // 実行と検証：
    await expect(
      transformer.use(createClearContext() as IMiddleware.UseContext, createNext()),
    ).rejects.toThrow("WriteOnly.clear は allowDelete が false のため全件を削除できません。");
  });

  test("en に戻すと英語メッセージになる", ({ expect, setLang }) => {
    // 準備：
    const error = new WriteOnlyClearNotAllowedError();

    // 実行と検証：
    setLang("ja");
    expect(error.message).toBe(
      "WriteOnly.clear は allowDelete が false のため全件を削除できません。",
    );

    setLang("en");
    expect(error.message).toBe("WriteOnly.clear with allowDelete false cannot delete all data.");
  });
});
describe("KeyNotFoundError の国際化 (server)", () => {
  test("ja を設定すると decode のエラーが日本語になる", async ({ expect, setLang }) => {
    // 準備：
    const transformer = new WriteOnly();

    setLang("ja");

    // 実行と検証：
    await expect(
      transformer.decode(createDecodeContext("v1", "k1") as IMiddleware.DecodeContext),
    ).rejects.toThrow("キー k1 が見つかりません");
  });

  test("en に戻すと英語メッセージになる", ({ expect, setLang }) => {
    // 準備：
    const error = new KeyNotFoundError({ key: "k1" });

    // 実行と検証：
    setLang("ja");
    expect(error.message).toBe("キー k1 が見つかりません");

    setLang("en");
    expect(error.message).toBe("Key not found: k1");
  });

  test("日本語メッセージでもキーは meta にそのまま保持される", async ({ expect, setLang }) => {
    // 準備：
    const transformer = new WriteOnly();

    setLang("ja");
    let error: unknown;

    // 実行：
    try {
      await transformer.decode(createDecodeContext("v1", "キー🔑") as IMiddleware.DecodeContext);
    } catch (ex) {
      error = ex;
    }

    // 検証：
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect(error).toMatchObject({ meta: { key: "キー🔑" } });
    expect((error as KeyNotFoundError).message).toBe("キー キー🔑 が見つかりません");
  });
});
