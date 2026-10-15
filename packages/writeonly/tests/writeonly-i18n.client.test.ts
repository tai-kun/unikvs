import type { IMiddleware } from "@unikvs/core";
import {
  createClearContext,
  createDecodeContext,
  createDeleteContext,
  createNext,
} from "@unikvs/testing";
import { deleteGlobalConfig, setGlobalConfig } from "valibot";
import { describe, test as vitest } from "vitest";

import { WriteOnlyClearNotAllowedError, WriteOnlyDeleteNotAllowedError } from "../src/errors.js";
import WriteOnly from "../src/write-only.js";

/**
 * 言語設定をテスト内でのみ変更するフィクスチャーです。
 * 設定した言語はテスト終了後に削除され、ほかのテストに影響しません。
 * ブラウザー環境での日本語メッセージを検証するために使用します。
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

describe("WriteOnlyDeleteNotAllowedError の国際化 (client)", () => {
  test("en では英語メッセージになる", ({ expect, setLang }) => {
    // 準備
    const error = new WriteOnlyDeleteNotAllowedError({ key: "k1" });
    setLang("en");

    // 実行と検証
    expect(error.message).toBe('WriteOnly.delete with allowDelete false cannot delete key "k1".');
    expect(error.meta).toStrictEqual({ key: "k1" });
    expect(error.name).toBe("WriteOnlyDeleteNotAllowedError");
  });

  test("ja を設定すると use のエラーが日本語になる", async ({ expect, setLang }) => {
    // 準備
    const transformer = new WriteOnly();
    setLang("ja");

    // 実行と検証
    await expect(
      transformer.use(createDeleteContext("k1") as IMiddleware.UseContext, createNext()),
    ).rejects.toThrow(
      'WriteOnly.delete は allowDelete が false のためキー "k1" を削除できません。',
    );
  });
});

describe("WriteOnlyClearNotAllowedError の国際化 (client)", () => {
  test("en では英語メッセージになる", ({ expect, setLang }) => {
    // 準備
    const error = new WriteOnlyClearNotAllowedError();
    setLang("en");

    // 実行と検証
    expect(error.message).toBe("WriteOnly.clear with allowDelete false cannot delete all data.");
    expect(error.name).toBe("WriteOnlyClearNotAllowedError");
  });

  test("ja を設定すると use のエラーが日本語になる", async ({ expect, setLang }) => {
    // 準備
    const transformer = new WriteOnly();
    setLang("ja");

    // 実行と検証
    await expect(
      transformer.use(createClearContext() as IMiddleware.UseContext, createNext()),
    ).rejects.toThrow("WriteOnly.clear は allowDelete が false のため全件を削除できません。");
  });
});

describe("KeyNotFoundError の国際化 (client)", () => {
  test("ja を設定すると decode のエラーが日本語になる", async ({ expect, setLang }) => {
    // 準備
    const transformer = new WriteOnly();
    setLang("ja");

    // 実行と検証
    await expect(
      transformer.decode(createDecodeContext("v1", "k1") as IMiddleware.DecodeContext),
    ).rejects.toThrow("キー k1 が見つかりません");
  });
});
