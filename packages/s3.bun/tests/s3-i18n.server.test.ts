import { InvalidUsageErrorBase } from "@unikvs/core";
import { describe, test as vitest } from "vitest";

import { deleteGlobalConfig, setGlobalConfig } from "../../core/node_modules/valibot/dist/index.js";
import {
  InvalidPartSizeError,
  StorageAbortedError,
  StorageNotOpenError,
  UnsupportedRuntimeError,
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
  test("UnsupportedRuntimeError は既定では英語メッセージと name を持つ", ({ expect }) => {
    // 準備
    const error = new UnsupportedRuntimeError();

    // 実行と検証
    expect(error).toBeInstanceOf(InvalidUsageErrorBase);
    expect(error.name).toBe("S3UnsupportedRuntimeError");
    expect(error.message).toBe("S3 can only be used in the Bun runtime");
  });

  test("UnsupportedRuntimeError は ja を設定すると日本語メッセージになる", ({
    expect,
    setLang,
  }) => {
    // 準備
    const error = new UnsupportedRuntimeError();

    // 実行
    setLang("ja");

    // 検証
    expect(error.message).toBe("S3 は Bun ランタイムでのみ使用できます");
  });

  test("UnsupportedRuntimeError は en に戻すと英語メッセージに戻る", ({ expect, setLang }) => {
    // 準備
    const error = new UnsupportedRuntimeError();

    // 実行と検証
    setLang("ja");
    expect(error.message).toBe("S3 は Bun ランタイムでのみ使用できます");

    setLang("en");
    expect(error.message).toBe("S3 can only be used in the Bun runtime");
  });

  test("StorageNotOpenError は ja を設定すると日本語メッセージになる", ({ expect, setLang }) => {
    // 準備
    const error = new StorageNotOpenError();

    // 実行
    setLang("ja");

    // 検証
    expect(error.message).toBe(
      "S3 クライアントがオープンされていません。close() の前に open() を呼び出してください",
    );
  });

  test("InvalidPartSizeError は ja を設定すると値と推奨値を含む日本語メッセージになる", ({
    expect,
    setLang,
  }) => {
    // 準備
    const error = new InvalidPartSizeError({ actual: 0 });

    // 実行
    setLang("ja");

    // 検証
    expect(error.message).toContain("変数に無効なパートサイズ 0 が指定されました");
    expect(error.message).toContain(String(5 * 1024 * 1024));
  });

  test("StorageAbortedError は ja を設定するとキーを含む日本語メッセージになる", ({
    expect,
    setLang,
  }) => {
    // 準備
    const error = new StorageAbortedError({ key: "greeting.bin" });

    // 実行
    setLang("ja");

    // 検証
    expect(error.message).toContain('キー "greeting.bin" のアップロード');
  });
});
