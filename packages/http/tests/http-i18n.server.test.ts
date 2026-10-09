import { describe, test as vitest } from "vitest";

// valibot は @unikvs/core の peerDependency であり @unikvs/http からは解決できないため、
// サーバーテストに限り core の node_modules を直接参照して言語設定を切り替えます。
import { deleteGlobalConfig, setGlobalConfig } from "../../core/node_modules/valibot/dist/index.js";
import {
  ClearNotSupportedError,
  ClearWithoutPrefixNotAllowedError,
  HttpNetworkError,
  HttpResponseError,
  InvalidBaseUrlError,
  InvalidChunkTypeError,
  InvalidHeadersError,
  InvalidKeyError,
  InvalidTokenError,
  KeyNotFoundError,
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

describe("エラーメッセージ（日本語）", () => {
  test("InvalidBaseUrlError は日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備
    setLang("ja");

    // 実行と検証
    expect(new InvalidBaseUrlError({ actual: "x" }).message).toBe(
      "`baseUrl` はクエリー・フラグメントなしの絶対 URL でなければなりません。受け取った値: x",
    );
  });

  test("InvalidHeadersError は日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備
    setLang("ja");

    // 実行と検証
    expect(new InvalidHeadersError({ actual: 42 }).message).toBe(
      "ヘッダーは文字列を値に持つオブジェクトでなければなりません。受け取った値: 42",
    );
  });

  test("InvalidTokenError は日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備
    setLang("ja");

    // 実行と検証
    expect(new InvalidTokenError({ actual: "" }).message).toBe(
      "トークンは空でない文字列でなければなりません。受け取った値: ",
    );
  });

  test("InvalidKeyError は日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備
    setLang("ja");

    // 実行と検証
    expect(new InvalidKeyError({ key: "k" }).message).toBe(
      'キー "k" を URL パスセグメントとして符号化できませんでした',
    );
  });

  test("ClearWithoutPrefixNotAllowedError は日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備
    setLang("ja");

    // 実行と検証
    expect(new ClearWithoutPrefixNotAllowedError().message).toBe(
      "キープレフィックスなしでの clear を拒否します。空でない keyPrefix を設定するか、allowClearWithoutPrefix: true を指定してください。",
    );
  });

  test("ClearNotSupportedError は日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備
    setLang("ja");

    // 実行と検証
    expect(new ClearNotSupportedError({ prefix: "a:", status: 405 }).message).toBe(
      'サーバーが DELETE ?prefix= に対応していません (prefix "a:"、status 405)。サーバー側で prefix 削除を実装するか、clear の呼び出しを止めてください。',
    );
  });

  test("HttpNetworkError は日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備
    setLang("ja");

    // 実行と検証
    expect(new HttpNetworkError({ method: "PUT", url: "https://x/k", key: "k" }).message).toBe(
      "PUT https://x/k へのリクエストに失敗しました",
    );
  });

  test("HttpResponseError は日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備
    setLang("ja");

    // 実行と検証
    expect(
      new HttpResponseError({
        method: "GET",
        url: "https://x/k",
        status: 500,
        statusText: "Internal Server Error",
        key: "k",
      }).message,
    ).toBe("リクエスト GET https://x/k が 500 Internal Server Error で失敗しました");
    expect(
      new HttpResponseError({
        method: "GET",
        url: "https://x/k",
        status: 500,
        statusText: "",
        key: "k",
      }).message,
    ).toBe("リクエスト GET https://x/k が 500 で失敗しました");
  });

  test("InvalidChunkTypeError は日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備
    setLang("ja");

    // 実行
    const error = new InvalidChunkTypeError({ key: "foo", chunk: "bar" });

    // 検証
    expect(error.meta.chunkType).toBe("string");
    expect(error.message).toBe(
      'キー "foo" のチャンク型に Uint8Array<ArrayBuffer> を期待しましたが、string を得ました',
    );
  });

  test("KeyNotFoundError は日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備
    setLang("ja");

    // 実行と検証
    expect(new KeyNotFoundError({ key: "foo" }).message).toBe("キー foo が見つかりません");
  });
});
