import { describe, test as vitest } from "vitest";

import { deleteGlobalConfig, setGlobalConfig } from "../../core/node_modules/valibot/dist/index.js";
import { CborDecodeError, CborEncodeError } from "../src/errors.js";

/**
 * 言語設定をテスト内でのみ変更するためのフィクスチャーです。
 * 設定した言語はテスト終了後に削除され、ほかのテストに影響しません。
 *
 * valibot は cbor の直接依存ではないため、@unikvs/core が使う実体を
 * 明示的に参照しています。ブラウザーでモジュール実体が分かれないよう、
 * vitest.client.ts の optimizeDeps から valibot を除外しています。
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

describe("CborEncodeError", () => {
  test("既定では英語メッセージを返す", ({ expect }) => {
    // 実行
    const error = new CborEncodeError();

    // 検証
    expect(error).toBeInstanceOf(globalThis.Error);
    expect(error.name).toBe("UniKvsCborEncodeError");
    expect(error.meta).toBeUndefined();
    expect(error.message).toBe("Failed to encode a value to CBOR");
  });

  test("cause を保持する", ({ expect }) => {
    // 準備
    const cause = new Error("原因");

    // 実行
    const error = new CborEncodeError({ cause });

    // 検証
    expect(error.cause).toBe(cause);
  });

  test("言語設定が日本語なら日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備
    const error = new CborEncodeError();

    // 実行
    setLang("ja");

    // 検証
    expect(error.message).toBe("値の CBOR エンコードに失敗しました");
  });
});

describe("CborDecodeError", () => {
  test("既定では英語メッセージを返す", ({ expect }) => {
    // 実行
    const error = new CborDecodeError();

    // 検証
    expect(error).toBeInstanceOf(globalThis.Error);
    expect(error.name).toBe("UniKvsCborDecodeError");
    expect(error.meta).toBeUndefined();
    expect(error.message).toBe("Failed to decode the CBOR data");
  });

  test("cause を保持する", ({ expect }) => {
    // 準備
    const cause = new Error("原因");

    // 実行
    const error = new CborDecodeError({ cause });

    // 検証
    expect(error.cause).toBe(cause);
  });

  test("言語設定が日本語なら日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備
    const error = new CborDecodeError();

    // 実行
    setLang("ja");

    // 検証
    expect(error.message).toBe("CBOR データのデコードに失敗しました");
  });
});
