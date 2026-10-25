import { setGlobalConfig, deleteGlobalConfig } from "valibot";
import { test as vitest, describe } from "vite-plus/test";

import {
  ConnectTimeoutError,
  InvalidTtlSecondsError,
  InvalidConnectTimeoutError,
} from "../src/errors.js";

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
describe("エラーメッセージ（日本語）", () => {
  test("InvalidTtlSecondsError は日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備：
    setLang("ja");

    // 実行：
    const error = new InvalidTtlSecondsError({ actual: -1 });

    // 検証：
    expect(error.message).toBe(
      "`ttlSeconds` は 0 以上の有限数でなければなりません。受け取った値: -1",
    );
  });

  test("InvalidConnectTimeoutError は日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備：
    setLang("ja");

    // 実行：
    const error = new InvalidConnectTimeoutError({ actual: 0 });

    // 検証：
    expect(error.message).toBe(
      "`connectTimeout` は有限の正数 (ミリ秒) でなければなりません。受け取った値: 0",
    );
  });

  test("ConnectTimeoutError は日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備：
    setLang("ja");

    // 実行：
    const error = new ConnectTimeoutError({ timeoutMs: 1000 });

    // 検証：
    expect(error.message).toBe("Memcached への接続が 1000ms でタイムアウトしました");
  });
});
