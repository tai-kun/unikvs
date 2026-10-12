import { deleteGlobalConfig, setGlobalConfig } from "valibot";
import { describe, test as vitest } from "vitest";

import { InvalidClearBehaviorError, KeyPrefixClearNotSupportedError } from "../src/errors.js";
import KeyPrefix from "../src/key-prefix.js";

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

describe("KeyPrefixClearNotSupportedError の国際化 (server)", () => {
  test("既定では英語メッセージになる", ({ expect }) => {
    // 準備
    const error = new KeyPrefixClearNotSupportedError({
      prefix: "tenant:",
      clearBehavior: "deny",
    });

    // 実行と検証
    expect(error.message).toBe(
      'KeyPrefix.clear with prefix "tenant:" cannot guarantee scoped deletion. Use clearBehavior "allow" when single-tenant exclusive use is guaranteed.',
    );
  });

  test("ja を設定すると onClear のエラーが日本語になる", ({ expect, setLang }) => {
    // 準備
    const prefix = new KeyPrefix("tenant:", { clearBehavior: "deny" });
    setLang("ja");

    // 実行と検証
    expect(() => prefix.onClear()).toThrow(
      'プレフィックス "tenant:" 付きの KeyPrefix.clear は範囲限定削除を保証できないため実行できません。単一テナント占有が保証できる場合には clearBehavior "allow" を使ってください',
    );
  });

  test("en に戻すと英語メッセージになる", ({ expect, setLang }) => {
    // 準備
    const error = new KeyPrefixClearNotSupportedError({
      prefix: "tenant:",
      clearBehavior: "deny",
    });

    // 実行と検証
    setLang("ja");
    expect(error.message).toBe(
      'プレフィックス "tenant:" 付きの KeyPrefix.clear は範囲限定削除を保証できないため実行できません。単一テナント占有が保証できる場合には clearBehavior "allow" を使ってください',
    );

    setLang("en");
    expect(error.message).toBe(
      'KeyPrefix.clear with prefix "tenant:" cannot guarantee scoped deletion. Use clearBehavior "allow" when single-tenant exclusive use is guaranteed.',
    );
  });

  test("日本語メッセージでも prefix は meta にそのまま保持される", ({ expect, setLang }) => {
    // 準備
    const prefix = new KeyPrefix("テナント🔑:", { clearBehavior: "deny" });
    setLang("ja");
    let error: unknown;

    // 実行
    try {
      prefix.onClear();
    } catch (ex) {
      error = ex;
    }

    // 検証
    expect(error).toBeInstanceOf(KeyPrefixClearNotSupportedError);
    expect(error).toMatchObject({ meta: { prefix: "テナント🔑:", clearBehavior: "deny" } });
    expect((error as KeyPrefixClearNotSupportedError).message).toBe(
      'プレフィックス "テナント🔑:" 付きの KeyPrefix.clear は範囲限定削除を保証できないため実行できません。単一テナント占有が保証できる場合には clearBehavior "allow" を使ってください',
    );
  });
});

describe("InvalidClearBehaviorError の国際化 (server)", () => {
  test("既定では英語メッセージになる", ({ expect }) => {
    // 準備
    const error = new InvalidClearBehaviorError({ actual: "alllow" });

    // 実行と検証
    expect(error.message).toBe('clearBehavior must be "allow" or "deny", but got alllow.');
  });

  test("ja を設定するとエラーが日本語になる", ({ expect, setLang }) => {
    // 準備
    const error = new InvalidClearBehaviorError({ actual: "alllow" });
    setLang("ja");

    // 実行と検証
    expect(error.message).toBe(
      'clearBehavior は "allow" か "deny" でなければなりません。受け取った値: alllow',
    );
  });

  test("日本語メッセージでも actual は meta にそのまま保持される", ({ expect, setLang }) => {
    // 準備
    const error = new InvalidClearBehaviorError({ actual: 123 });
    setLang("ja");

    // 実行と検証
    expect(error.message).toBe(
      'clearBehavior は "allow" か "deny" でなければなりません。受け取った値: 123',
    );
    expect(error.meta).toStrictEqual({ actual: 123 });
  });
});
