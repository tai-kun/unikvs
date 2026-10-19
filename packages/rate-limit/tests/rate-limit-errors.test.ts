import { deleteGlobalConfig, setGlobalConfig } from "valibot";
import { describe, test as vitest } from "vitest";

import { RateLimitExceededError, RateLimitInvalidOptionError } from "../src/errors.js";

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

describe("RateLimitInvalidOptionError のメッセージ", () => {
  test("数値・真偽値・null をそのまま埋め込む", ({ expect }) => {
    expect(new RateLimitInvalidOptionError({ name: "intervalMs", actual: 0 }).message).toBe(
      'Invalid RateLimit option "intervalMs": 0',
    );
    expect(new RateLimitInvalidOptionError({ name: "enabled", actual: false }).message).toBe(
      'Invalid RateLimit option "enabled": false',
    );
    expect(new RateLimitInvalidOptionError({ name: "now", actual: null }).message).toBe(
      'Invalid RateLimit option "now": null',
    );
  });

  test("文字列は JSON 文字列として引用する", ({ expect }) => {
    expect(new RateLimitInvalidOptionError({ name: "strategy", actual: "bogus" }).message).toBe(
      'Invalid RateLimit option "strategy": "bogus"',
    );
  });

  test("オブジェクトは JSON として整形する", ({ expect }) => {
    expect(new RateLimitInvalidOptionError({ name: "options", actual: { a: 1 } }).message).toBe(
      'Invalid RateLimit option "options": {"a":1}',
    );
  });

  test("循環参照は [object Object] にフォールバックする", ({ expect }) => {
    // 準備
    const actual: Record<string, unknown> = {};
    actual["self"] = actual;

    // 実行と検証
    expect(new RateLimitInvalidOptionError({ name: "options", actual }).message).toBe(
      'Invalid RateLimit option "options": [object Object]',
    );
  });

  test("ja を設定すると日本語になる", ({ expect, setLang }) => {
    // 準備
    setLang("ja");

    // 実行と検証
    expect(new RateLimitInvalidOptionError({ name: "strategy", actual: "bogus" }).message).toBe(
      '無効な RateLimit オプション "strategy": "bogus"',
    );
    expect(new RateLimitExceededError({ retryAfterMs: 1000 }).message).toBe(
      "レート制限を超えました。1000ms 後に再試行してください。",
    );
  });

  test("en に戻すと英語メッセージになる", ({ expect, setLang }) => {
    // 準備
    setLang("ja");
    const error = new RateLimitExceededError({ retryAfterMs: 500 });

    // 実行と検証
    expect(error.message).toBe("レート制限を超えました。500ms 後に再試行してください。");

    setLang("en");
    expect(error.message).toBe("Rate limit exceeded. Retry after 500ms.");
  });
});
