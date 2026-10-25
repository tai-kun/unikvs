import type { IMiddleware } from "@unikvs/core";
import {
  createNext,
  createClearContext,
  createDeleteContext,
  createEncodeContext,
} from "@unikvs/testing";
import { setGlobalConfig, deleteGlobalConfig } from "valibot";
import { test as vitest, describe } from "vite-plus/test";

import {
  ReadOnlySetNotAllowedError,
  ReadOnlyClearNotAllowedError,
  ReadOnlyDeleteNotAllowedError,
} from "../src/errors.js";
import ReadOnly from "../src/readonly.js";

/**
 * 言語設定をテスト内でのみ変更するフィクスチャーです。
 * 設定した言語はテスト終了後に削除され、ほかのテストに影響しません。
 * ブラウザー環境での日本語メッセージを検証するために使用します。
 */
const test = vitest.extend<{ setLang: (lang: string) => void }>({
  async setLang({}, use) {
    await use((lang) => {
      setGlobalConfig({ lang });
    });
    deleteGlobalConfig();
  },
});
describe("ReadOnlySetNotAllowedError の国際化 (client)", () => {
  test("en では英語メッセージになる", ({ expect, setLang }) => {
    // 準備：
    const error = new ReadOnlySetNotAllowedError({ key: "k1" });

    setLang("en");

    // 実行と検証：
    expect(error.message).toBe('ReadOnly.set cannot write key "k1".');
    expect(error.meta).toStrictEqual({ key: "k1" });
    expect(error.name).toBe("ReadOnlySetNotAllowedError");
  });

  test("ja を設定すると encode のエラーが日本語になる", async ({ expect, setLang }) => {
    // 準備：
    const transformer = new ReadOnly();

    setLang("ja");

    // 実行と検証：
    await expect(
      transformer.encode(
        createEncodeContext("v1", "k1") as IMiddleware.EncodeContext,
        createNext(),
      ),
    ).rejects.toThrow('ReadOnly.set は読み取り専用のためキー "k1" に書き込めません。');
  });
});
describe("ReadOnlyDeleteNotAllowedError の国際化 (client)", () => {
  test("en では英語メッセージになる", ({ expect, setLang }) => {
    // 準備：
    const error = new ReadOnlyDeleteNotAllowedError({ key: "k1" });

    setLang("en");

    // 実行と検証：
    expect(error.message).toBe('ReadOnly.delete with allowDelete false cannot delete key "k1".');
    expect(error.meta).toStrictEqual({ key: "k1" });
    expect(error.name).toBe("ReadOnlyDeleteNotAllowedError");
  });

  test("ja を設定すると use のエラーが日本語になる", async ({ expect, setLang }) => {
    // 準備：
    const transformer = new ReadOnly();

    setLang("ja");

    // 実行と検証：
    await expect(
      transformer.use(createDeleteContext("k1") as IMiddleware.UseContext, createNext()),
    ).rejects.toThrow('ReadOnly.delete は allowDelete が false のためキー "k1" を削除できません。');
  });
});
describe("ReadOnlyClearNotAllowedError の国際化 (client)", () => {
  test("en では英語メッセージになる", ({ expect, setLang }) => {
    // 準備：
    const error = new ReadOnlyClearNotAllowedError();

    setLang("en");

    // 実行と検証：
    expect(error.message).toBe("ReadOnly.clear with allowDelete false cannot delete all data.");
    expect(error.name).toBe("ReadOnlyClearNotAllowedError");
  });

  test("ja を設定すると use のエラーが日本語になる", async ({ expect, setLang }) => {
    // 準備：
    const transformer = new ReadOnly();

    setLang("ja");

    // 実行と検証：
    await expect(
      transformer.use(createClearContext() as IMiddleware.UseContext, createNext()),
    ).rejects.toThrow("ReadOnly.clear は allowDelete が false のため全件を削除できません。");
  });
});
