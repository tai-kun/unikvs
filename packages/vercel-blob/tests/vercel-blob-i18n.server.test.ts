import { deleteGlobalConfig, setGlobalConfig } from "valibot";
import { describe, test as vitest } from "vitest";

import {
  BlobNetworkError,
  BlobOperationError,
  BlobResponseError,
  InvalidAccessError,
  InvalidChunkTypeError,
  InvalidTokenError,
} from "../src/errors.js";

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

describe("エラーメッセージ（英語と日本語）", () => {
  test("InvalidTokenError は英語と日本語のメッセージを返す", ({ expect, setLang }) => {
    // 実行と検証
    expect(new InvalidTokenError({ actual: "" }).message).toBe(
      "Expected token to be a non-empty string, but got ",
    );

    // 準備
    setLang("ja");

    // 実行と検証
    expect(new InvalidTokenError({ actual: "" }).message).toBe(
      "トークンは空でない文字列でなければなりません。受け取った値: ",
    );
  });

  test("InvalidAccessError は英語と日本語のメッセージを返す", ({ expect, setLang }) => {
    // 実行と検証
    expect(new InvalidAccessError({ actual: "both" }).message).toBe(
      'Expected access to be "public" or "private", but got both',
    );

    // 準備
    setLang("ja");

    // 実行と検証
    expect(new InvalidAccessError({ actual: "both" }).message).toBe(
      '`access` は "public" か "private" でなければなりません。受け取った値: both',
    );
  });

  test("BlobOperationError は英語と日本語のメッセージを返す", ({ expect, setLang }) => {
    // 実行と検証
    expect(new BlobOperationError({ operation: "put", key: "k" }).message).toBe(
      'Failed to put blob for key "k"',
    );
    expect(new BlobOperationError({ operation: "list", key: undefined }).message).toBe(
      "Failed to list blob(s)",
    );

    // 準備
    setLang("ja");

    // 実行と検証
    expect(new BlobOperationError({ operation: "put", key: "k" }).message).toBe(
      'キー "k" の Blob の put に失敗しました',
    );
    expect(new BlobOperationError({ operation: "list", key: undefined }).message).toBe(
      "Blob の list に失敗しました",
    );
  });

  test("BlobNetworkError は英語と日本語のメッセージを返す", ({ expect, setLang }) => {
    // 実行と検証
    expect(new BlobNetworkError({ url: "https://x/k", key: "k" }).message).toBe(
      "Failed to download https://x/k",
    );

    // 準備
    setLang("ja");

    // 実行と検証
    expect(new BlobNetworkError({ url: "https://x/k", key: "k" }).message).toBe(
      "https://x/k のダウンロード要求に失敗しました",
    );
  });

  test("BlobResponseError は英語と日本語のメッセージを返す", ({ expect, setLang }) => {
    // 実行と検証
    expect(
      new BlobResponseError({
        url: "https://x/k",
        key: "k",
        status: 500,
        statusText: "Internal Server Error",
      }).message,
    ).toBe("Failed to download https://x/k with 500 Internal Server Error");
    expect(
      new BlobResponseError({ url: "https://x/k", key: "k", status: 500, statusText: "" }).message,
    ).toBe("Failed to download https://x/k with 500");

    // 準備
    setLang("ja");

    // 実行と検証
    expect(
      new BlobResponseError({
        url: "https://x/k",
        key: "k",
        status: 500,
        statusText: "Internal Server Error",
      }).message,
    ).toBe("https://x/k のダウンロードが 500 Internal Server Error で失敗しました");
    expect(
      new BlobResponseError({ url: "https://x/k", key: "k", status: 500, statusText: "" }).message,
    ).toBe("https://x/k のダウンロードが 500 で失敗しました");
  });

  test("InvalidChunkTypeError は英語と日本語のメッセージを返す", ({ expect, setLang }) => {
    // 実行
    const error = new InvalidChunkTypeError({ key: "foo", chunk: "bar" });

    // 検証
    expect(error.meta.chunkType).toBe("string");
    expect(error.message).toBe(
      'Expected chunk for key "foo" is Uint8Array<ArrayBuffer>, but got string',
    );

    // 準備
    setLang("ja");

    // 実行と検証
    expect(new InvalidChunkTypeError({ key: "foo", chunk: "bar" }).message).toBe(
      'キー "foo" のチャンク型に Uint8Array<ArrayBuffer> を期待しましたが、string を得ました',
    );
  });
});
