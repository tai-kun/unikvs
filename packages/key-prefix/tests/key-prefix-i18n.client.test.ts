import { deleteGlobalConfig, setGlobalConfig } from "valibot";
import { describe, test as vitest } from "vitest";

import { InvalidClearBehaviorError, KeyPrefixClearNotSupportedError } from "../src/errors.js";
import KeyPrefix from "../src/key-prefix.js";

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

describe("KeyPrefixClearNotSupportedError の国際化 (client)", () => {
  test("en では英語メッセージになる", ({ expect, setLang }) => {
    // 準備
    const error = new KeyPrefixClearNotSupportedError({
      prefix: "tenant:",
      clearBehavior: "deny",
    });
    setLang("en");

    // 実行と検証
    expect(error.message).toBe(
      'KeyPrefix.clear with prefix "tenant:" cannot guarantee scoped deletion. Use clearBehavior "allow" when single-tenant exclusive use is guaranteed.',
    );
    expect(error.meta).toStrictEqual({ prefix: "tenant:", clearBehavior: "deny" });
    expect(error.name).toBe("KeyPrefixClearNotSupportedError");
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
});

describe("InvalidClearBehaviorError の国際化 (client)", () => {
  test("en では英語メッセージになる", ({ expect, setLang }) => {
    // 準備
    const error = new InvalidClearBehaviorError({ actual: "alllow" });
    setLang("en");

    // 実行と検証
    expect(error.message).toBe('clearBehavior must be "allow" or "deny", but got alllow.');
    expect(error.meta).toStrictEqual({ actual: "alllow" });
    expect(error.name).toBe("KeyPrefixInvalidClearBehaviorError");
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
});
