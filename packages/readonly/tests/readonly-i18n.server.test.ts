import type { IMiddleware } from "@unikvs/core";
import {
  createClearContext,
  createDeleteContext,
  createEncodeContext,
  createNext,
} from "@unikvs/testing";
import { deleteGlobalConfig, setGlobalConfig } from "valibot";
import { describe, test as vitest } from "vitest";

import {
  ReadOnlyClearNotAllowedError,
  ReadOnlyDeleteNotAllowedError,
  ReadOnlySetNotAllowedError,
} from "../src/errors.js";
import ReadOnly from "../src/readonly.js";

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

describe("ReadOnlySetNotAllowedError の国際化 (server)", () => {
  test("既定では英語メッセージになる", ({ expect }) => {
    // 準備
    const error = new ReadOnlySetNotAllowedError({ key: "k1" });

    // 実行と検証
    expect(error.message).toBe('ReadOnly.set cannot write key "k1".');
  });

  test("ja を設定すると encode のエラーが日本語になる", async ({ expect, setLang }) => {
    // 準備
    const transformer = new ReadOnly();
    setLang("ja");

    // 実行と検証
    await expect(
      transformer.encode(
        createEncodeContext("v1", "k1") as IMiddleware.EncodeContext,
        createNext(),
      ),
    ).rejects.toThrow('ReadOnly.set は読み取り専用のためキー "k1" に書き込めません。');
  });

  test("en に戻すと英語メッセージになる", ({ expect, setLang }) => {
    // 準備
    const error = new ReadOnlySetNotAllowedError({ key: "k1" });

    // 実行と検証
    setLang("ja");
    expect(error.message).toBe('ReadOnly.set は読み取り専用のためキー "k1" に書き込めません。');

    setLang("en");
    expect(error.message).toBe('ReadOnly.set cannot write key "k1".');
  });

  test("日本語メッセージでもキーは meta にそのまま保持される", async ({ expect, setLang }) => {
    // 準備
    const transformer = new ReadOnly();
    setLang("ja");

    // 実行
    let error: unknown;
    try {
      await transformer.encode(
        createEncodeContext("v1", "キー🔑") as IMiddleware.EncodeContext,
        createNext(),
      );
    } catch (ex) {
      error = ex;
    }

    // 検証
    expect(error).toBeInstanceOf(ReadOnlySetNotAllowedError);
    expect(error).toMatchObject({ meta: { key: "キー🔑" } });
    expect((error as ReadOnlySetNotAllowedError).message).toBe(
      'ReadOnly.set は読み取り専用のためキー "キー🔑" に書き込めません。',
    );
  });
});

describe("ReadOnlyDeleteNotAllowedError の国際化 (server)", () => {
  test("既定では英語メッセージになる", ({ expect }) => {
    // 準備
    const error = new ReadOnlyDeleteNotAllowedError({ key: "k1" });

    // 実行と検証
    expect(error.message).toBe('ReadOnly.delete with allowDelete false cannot delete key "k1".');
  });

  test("ja を設定すると use のエラーが日本語になる", async ({ expect, setLang }) => {
    // 準備
    const transformer = new ReadOnly();
    setLang("ja");

    // 実行と検証
    await expect(
      transformer.use(createDeleteContext("k1") as IMiddleware.UseContext, createNext()),
    ).rejects.toThrow('ReadOnly.delete は allowDelete が false のためキー "k1" を削除できません。');
  });

  test("en に戻すと英語メッセージになる", ({ expect, setLang }) => {
    // 準備
    const error = new ReadOnlyDeleteNotAllowedError({ key: "k1" });

    // 実行と検証
    setLang("ja");
    expect(error.message).toBe(
      'ReadOnly.delete は allowDelete が false のためキー "k1" を削除できません。',
    );

    setLang("en");
    expect(error.message).toBe('ReadOnly.delete with allowDelete false cannot delete key "k1".');
  });
});

describe("ReadOnlyClearNotAllowedError の国際化 (server)", () => {
  test("既定では英語メッセージになる", ({ expect }) => {
    // 準備
    const error = new ReadOnlyClearNotAllowedError();

    // 実行と検証
    expect(error.message).toBe("ReadOnly.clear with allowDelete false cannot delete all data.");
  });

  test("ja を設定すると use のエラーが日本語になる", async ({ expect, setLang }) => {
    // 準備
    const transformer = new ReadOnly();
    setLang("ja");

    // 実行と検証
    await expect(
      transformer.use(createClearContext() as IMiddleware.UseContext, createNext()),
    ).rejects.toThrow("ReadOnly.clear は allowDelete が false のため全件を削除できません。");
  });

  test("en に戻すと英語メッセージになる", ({ expect, setLang }) => {
    // 準備
    const error = new ReadOnlyClearNotAllowedError();

    // 実行と検証
    setLang("ja");
    expect(error.message).toBe(
      "ReadOnly.clear は allowDelete が false のため全件を削除できません。",
    );

    setLang("en");
    expect(error.message).toBe("ReadOnly.clear with allowDelete false cannot delete all data.");
  });
});
