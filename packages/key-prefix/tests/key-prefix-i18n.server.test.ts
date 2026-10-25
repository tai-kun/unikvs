import type { IMiddleware } from "@unikvs/core";
import { createNext, createClearContext } from "@unikvs/testing";
import { setGlobalConfig, deleteGlobalConfig } from "valibot";
import { test as vitest, describe } from "vite-plus/test";

import { KeyPrefixClearDeniedError } from "../src/errors.js";
import KeyPrefix from "../src/key-prefix.js";

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
describe("KeyPrefixClearDeniedError の国際化 (server)", () => {
  test("既定では英語メッセージになる", ({ expect }) => {
    // 準備：
    const error = new KeyPrefixClearDeniedError({
      prefix: "tenant:",
      allowClear: true,
    });

    // 実行と検証：
    expect(error.message).toBe(
      'KeyPrefix.clear with prefix "tenant:" cannot guarantee scoped deletion. Set allowClear to true when single-tenant exclusive use is guaranteed.',
    );
  });

  test("ja を設定すると use のエラーが日本語になる", async ({ expect, setLang }) => {
    // 準備：
    const prefix = new KeyPrefix("tenant:", { allowClear: true });

    setLang("ja");

    // 実行と検証：
    await expect(
      prefix.use(createClearContext() as IMiddleware.UseContext, createNext()),
    ).rejects.toThrow(
      'プレフィックス "tenant:" 付きの KeyPrefix.clear は、範囲限定削除を保証できないため拒否されました。単一テナントによる占有が保証できる場合は、allowClear: true を指定してください。',
    );
  });

  test("en に戻すと英語メッセージになる", ({ expect, setLang }) => {
    // 準備：
    const error = new KeyPrefixClearDeniedError({
      prefix: "tenant:",
      allowClear: true,
    });

    // 実行と検証：
    setLang("ja");
    expect(error.message).toBe(
      'プレフィックス "tenant:" 付きの KeyPrefix.clear は、範囲限定削除を保証できないため拒否されました。単一テナントによる占有が保証できる場合は、allowClear: true を指定してください。',
    );

    setLang("en");
    expect(error.message).toBe(
      'KeyPrefix.clear with prefix "tenant:" cannot guarantee scoped deletion. Set allowClear to true when single-tenant exclusive use is guaranteed.',
    );
  });

  test("日本語メッセージでも prefix は meta にそのまま保持される", async ({ expect, setLang }) => {
    // 準備：
    const prefix = new KeyPrefix("テナント🔑:", { allowClear: true });

    setLang("ja");
    let error: unknown;

    // 実行：
    try {
      await prefix.use(createClearContext() as IMiddleware.UseContext, createNext());
    } catch (ex) {
      error = ex;
    }

    // 検証：
    expect(error).toBeInstanceOf(KeyPrefixClearDeniedError);
    expect(error).toMatchObject({
      meta: {
        prefix: "テナント🔑:",
        allowClear: true,
      },
    });
    expect((error as KeyPrefixClearDeniedError).message).toBe(
      'プレフィックス "テナント🔑:" 付きの KeyPrefix.clear は、範囲限定削除を保証できないため拒否されました。単一テナントによる占有が保証できる場合は、allowClear: true を指定してください。',
    );
  });
});
