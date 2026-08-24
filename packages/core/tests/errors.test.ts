import { deleteGlobalConfig, setGlobalConfig } from "valibot";
import { describe, test as vitest } from "vitest";

import {
  ErrorBase,
  type ErrorOptions,
  InvalidUsageErrorBase,
  setErrorMessage,
} from "../src/errors.js";

/**
 * 言語設定をテスト内でのみ変更するためのフィクスチャーです。
 *
 * 設定した言語はテスト終了後に削除され、ほかのテストに影響しません。
 */
const test = vitest.extend<{
  setLang: (lang: string) => void;
}>({
  async setLang({}, use) {
    await use((lang) => {
      setGlobalConfig({ lang });
    });
    deleteGlobalConfig();
  },
});

type KeyNotFoundErrorArgs = {
  readonly key: string;
};

class KeyNotFoundError extends ErrorBase<KeyNotFoundErrorArgs> {
  static {
    this.prototype.name = "KeyNotFoundError";
  }

  public constructor(args: KeyNotFoundErrorArgs, options?: ErrorOptions) {
    super(args, ({ key }) => `Key not found: ${key}`, options);
  }
}

describe("ErrorBase", () => {
  test("globalThis.Error を継承する", ({ expect }) => {
    // 実行
    const error = new KeyNotFoundError({ key: "foo" });

    // 検証
    expect(error).toBeInstanceOf(globalThis.Error);
    expect(error).toBeInstanceOf(ErrorBase);
  });

  test("コンストラクターに渡したメタ情報を meta プロパティーとして保持する", ({ expect }) => {
    // 準備
    const args = { key: "foo" };

    // 実行
    const error = new KeyNotFoundError(args);

    // 検証
    expect(error.meta).toStrictEqual(args);
  });

  test("メタ情報を受け取るメッセージ関数から既定のメッセージを生成する", ({ expect }) => {
    // 実行と検証
    expect(new KeyNotFoundError({ key: "foo" }).message).toBe("Key not found: foo");
  });

  test("固定文字列の既定のメッセージを返す", ({ expect }) => {
    // 準備
    class ChecksumRequiredError extends ErrorBase<undefined> {
      public constructor(options?: ErrorOptions) {
        super("Checksum is required", options);
      }
    }

    // 実行と検証
    expect(new ChecksumRequiredError().message).toBe("Checksum is required");
  });

  test("cause オプションで渡した値を cause プロパティーとして保持する", ({ expect }) => {
    // 準備
    const cause = new Error("root");

    // 実行
    const error = new KeyNotFoundError({ key: "foo" }, { cause });

    // 検証
    expect(error.cause).toBe(cause);
  });

  test("静的プロパティー prefix をメッセージの先頭に付加する", ({ expect }) => {
    // 準備
    class PrefixedKeyNotFoundError extends KeyNotFoundError {}
    PrefixedKeyNotFoundError.prefix = "[unikvs] ";

    // 実行と検証
    expect(new PrefixedKeyNotFoundError({ key: "foo" }).message).toBe(
      "[unikvs] Key not found: foo",
    );
  });
});

describe("setErrorMessage", () => {
  test("登録した言語ではメッセージ関数が生成したメッセージを返す", ({ expect, setLang }) => {
    // 準備
    class JaKeyNotFoundError extends KeyNotFoundError {}
    setErrorMessage(JaKeyNotFoundError, ({ key }) => `${key} というキーは存在しません`, "ja");
    setLang("ja");

    // 実行と検証
    expect(new JaKeyNotFoundError({ key: "foo" }).message).toBe("foo というキーは存在しません");
  });

  test("複数の言語タグに一度に固定文字列のメッセージを登録できる", ({ expect, setLang }) => {
    // 準備
    class RateLimitedError extends KeyNotFoundError {}
    setErrorMessage(RateLimitedError, "Rate limited", ["ja", "fr"]);

    // 実行と検証
    setLang("ja");
    expect(new RateLimitedError({ key: "foo" }).message).toBe("Rate limited");

    setLang("fr");
    expect(new RateLimitedError({ key: "foo" }).message).toBe("Rate limited");
  });

  test("登録されていない言語では既定のメッセージにフォールバックする", ({ expect, setLang }) => {
    // 準備
    class JaOnlyKeyNotFoundError extends KeyNotFoundError {}
    setErrorMessage(JaOnlyKeyNotFoundError, ({ key }) => `${key} というキーは存在しません`, "ja");
    setLang("fr");

    // 実行と検証
    expect(new JaOnlyKeyNotFoundError({ key: "foo" }).message).toBe("Key not found: foo");
  });

  test("message へのアクセスごとに現在の言語でメッセージを解決する", ({ expect, setLang }) => {
    // 準備
    const error = new KeyNotFoundError({ key: "foo" });

    // 実行と検証
    expect(error.message).toBe("Key not found: foo");

    setErrorMessage(KeyNotFoundError, ({ key }) => `${key} というキーは存在しません`, "ja");
    setLang("ja");
    expect(error.message).toBe("foo というキーは存在しません");

    setLang("en");
    expect(error.message).toBe("Key not found: foo");
  });
});

describe("InvalidUsageErrorBase", () => {
  test("ErrorBase と globalThis.Error を継承する", ({ expect }) => {
    // 実行
    const error = new InvalidUsageErrorBase<{ readonly actual: unknown }>(
      { actual: null },
      ({ actual }) => `Invalid usage: ${String(actual)}`,
    );

    // 検証
    expect(error).toBeInstanceOf(globalThis.Error);
    expect(error).toBeInstanceOf(ErrorBase);
    expect(error).toBeInstanceOf(InvalidUsageErrorBase);
    expect(error.message).toBe("Invalid usage: null");
  });
});
