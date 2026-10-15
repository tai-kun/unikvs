import type { IMiddleware } from "@unikvs/core";
import { createClearContext, createNext } from "@unikvs/testing";
import { deleteGlobalConfig, setGlobalConfig } from "valibot";
import { describe, test as vitest } from "vitest";

import { KeyPrefixClearDeniedError } from "../src/errors.js";
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

describe("KeyPrefixClearDeniedError の国際化 (client)", () => {
  test("en では英語メッセージになる", ({ expect, setLang }) => {
    // 準備
    const error = new KeyPrefixClearDeniedError({
      prefix: "tenant:",
      allowClear: true,
    });
    setLang("en");

    // 実行と検証
    expect(error.message).toBe(
      'KeyPrefix.clear with prefix "tenant:" cannot guarantee scoped deletion. Set allowClear to true when single-tenant exclusive use is guaranteed.',
    );
    expect(error.meta).toStrictEqual({ prefix: "tenant:", allowClear: true });
    expect(error.name).toBe("KeyPrefixClearDeniedError");
  });

  test("ja を設定すると use のエラーが日本語になる", async ({ expect, setLang }) => {
    // 準備
    const prefix = new KeyPrefix("tenant:", { allowClear: true });
    setLang("ja");

    // 実行と検証
    await expect(
      prefix.use(createClearContext() as IMiddleware.UseContext, createNext()),
    ).rejects.toThrow(
      'プレフィックス "tenant:" 付きの KeyPrefix.clear は、範囲限定削除を保証できないため拒否されました。単一テナントによる占有が保証できる場合は、allowClear: true を指定してください。',
    );
  });
});
