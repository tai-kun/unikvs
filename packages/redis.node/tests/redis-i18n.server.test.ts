import { describe, test as vitest } from "vitest";

import { deleteGlobalConfig, setGlobalConfig } from "../../core/node_modules/valibot/dist/index.js";
import {
  CloseTimeoutError,
  ClusterNotSupportedError,
  ConnectTimeoutError,
  InvalidCloseTimeoutError,
  KeyNotFoundError,
} from "../src/errors.js";

/**
 * 言語設定をテスト内でのみ変更するためのフィクスチャーです。
 * テスト終了後にグローバル設定を削除し、ほかのテストに影響しません。
 */
const test = vitest.extend<{
  setLang: (lang: string) => void;
}>({
  // oxlint-disable-next-line no-empty-pattern
  async setLang({}, use) {
    await use((lang) => {
      setGlobalConfig({ lang });
    });
    deleteGlobalConfig();
  },
});

describe("エラーの国際化 (server)", () => {
  test("KeyNotFoundError は既定では英語メッセージと name を持つ", ({ expect }) => {
    // 準備と実行
    const error = new KeyNotFoundError({ key: "k1" });

    // 検証
    expect(error.name).toBe("RedisKeyNotFoundError");
    expect(error.message).toBe("Key not found: k1");
  });

  test("KeyNotFoundError は ja を設定するとキーを含む日本語メッセージになる", ({
    expect,
    setLang,
  }) => {
    // 準備
    const error = new KeyNotFoundError({ key: "greeting.bin" });

    // 実行
    setLang("ja");

    // 検証
    expect(error.message).toBe("キー greeting.bin が見つかりません");
  });

  test("KeyNotFoundError は en に戻すと英語メッセージに戻る", ({ expect, setLang }) => {
    // 準備
    const error = new KeyNotFoundError({ key: "greeting.bin" });

    // 実行と検証
    setLang("ja");
    expect(error.message).toBe("キー greeting.bin が見つかりません");

    setLang("en");
    expect(error.message).toBe("Key not found: greeting.bin");
  });

  test("ClusterNotSupportedError は既定では英語メッセージと name を持つ", ({ expect }) => {
    // 準備と実行
    const error = new ClusterNotSupportedError();

    // 検証
    expect(error.name).toBe("RedisClusterNotSupportedError");
    expect(error.message).toContain("standalone");
  });

  test("ClusterNotSupportedError は ja を設定すると日本語メッセージになる", ({
    expect,
    setLang,
  }) => {
    // 準備
    const error = new ClusterNotSupportedError();

    // 実行
    setLang("ja");

    // 検証
    expect(error.message).toBe(
      "Redis ストレージ v1 は standalone モードのみに対応します。`cluster` オプションはサポートされていません。",
    );
  });

  test("InvalidCloseTimeoutError は既定では英語メッセージと name を持つ", ({ expect }) => {
    // 準備と実行
    const error = new InvalidCloseTimeoutError({ actual: 0 });

    // 検証
    expect(error.name).toBe("RedisInvalidCloseTimeoutError");
    expect(error.message).toContain("`closeTimeout` must be a finite positive number");
  });

  test("InvalidCloseTimeoutError は ja を設定すると日本語メッセージになる", ({
    expect,
    setLang,
  }) => {
    // 準備
    const error = new InvalidCloseTimeoutError({ actual: 0 });

    // 実行
    setLang("ja");

    // 検証
    expect(error.message).toBe(
      "`closeTimeout` は有限の正数 (ミリ秒) でなければなりません。受け取った値: 0",
    );
  });

  test("ConnectTimeoutError は既定では英語メッセージと name を持つ", ({ expect }) => {
    // 準備と実行
    const error = new ConnectTimeoutError({ timeoutMs: 1000 });

    // 検証
    expect(error.name).toBe("RedisConnectTimeoutError");
    expect(error.message).toBe("Timed out connecting to Redis after 1000ms");
  });

  test("ConnectTimeoutError は ja を設定すると日本語メッセージになる", ({ expect, setLang }) => {
    // 準備
    const error = new ConnectTimeoutError({ timeoutMs: 1000 });

    // 実行
    setLang("ja");

    // 検証
    expect(error.message).toBe("Redis への接続が 1000ms でタイムアウトしました");
  });

  test("CloseTimeoutError は既定では英語メッセージと name を持つ", ({ expect }) => {
    // 準備と実行
    const error = new CloseTimeoutError({ timeoutMs: 100 });

    // 検証
    expect(error.name).toBe("RedisCloseTimeoutError");
    expect(error.message).toBe("Timed out closing Redis after 100ms");
  });

  test("CloseTimeoutError は ja を設定すると日本語メッセージになる", ({ expect, setLang }) => {
    // 準備
    const error = new CloseTimeoutError({ timeoutMs: 100 });

    // 実行
    setLang("ja");

    // 検証
    expect(error.message).toBe("Redis からの切断処理が 100ms でタイムアウトしました");
  });
});
