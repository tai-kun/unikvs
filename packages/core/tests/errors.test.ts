import { deleteGlobalConfig, setGlobalConfig } from "valibot";
import { describe, test as vitest } from "vitest";

import {
  ErrorBase,
  type ErrorOptions,
  InvalidPartSizeError,
  InvalidUsageErrorBase,
  KeyNotFoundError,
  RepairNotAllowedError,
  StorageAbortedError,
  UnsupportedRuntimeError,
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
  // oxlint-disable-next-line no-empty-pattern
  async setLang({}, use) {
    await use((lang) => {
      setGlobalConfig({ lang });
    });
    deleteGlobalConfig();
  },
});

type SampleKeyNotFoundErrorArgs = {
  readonly key: string;
};

/**
 * ErrorBase の動作検証に使用するサンプルのエラークラスです。
 */
class SampleKeyNotFoundError extends ErrorBase<SampleKeyNotFoundErrorArgs> {
  static {
    this.prototype.name = "KeyNotFoundError";
  }

  public constructor(args: SampleKeyNotFoundErrorArgs, options?: ErrorOptions) {
    super(args, ({ key }) => `Key not found: ${key}`, options);
  }
}

describe("ErrorBase", () => {
  test("globalThis.Error を継承する", ({ expect }) => {
    // 実行
    const error = new SampleKeyNotFoundError({ key: "foo" });

    // 検証
    expect(error).toBeInstanceOf(globalThis.Error);
    expect(error).toBeInstanceOf(ErrorBase);
  });

  test("コンストラクターに渡したメタ情報を meta プロパティーとして保持する", ({ expect }) => {
    // 準備
    const args = { key: "foo" };

    // 実行
    const error = new SampleKeyNotFoundError(args);

    // 検証
    expect(error.meta).toStrictEqual(args);
  });

  test("メタ情報を受け取るメッセージ関数から既定のメッセージを生成する", ({ expect }) => {
    // 実行と検証
    expect(new SampleKeyNotFoundError({ key: "foo" }).message).toBe("Key not found: foo");
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
    const error = new SampleKeyNotFoundError({ key: "foo" }, { cause });

    // 検証
    expect(error.cause).toBe(cause);
  });

  test("静的プロパティー prefix をメッセージの先頭に付加する", ({ expect }) => {
    // 準備
    class PrefixedKeyNotFoundError extends SampleKeyNotFoundError {}
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
    class JaKeyNotFoundError extends SampleKeyNotFoundError {}
    setErrorMessage(JaKeyNotFoundError, ({ key }) => `${key} というキーは存在しません`, "ja");
    setLang("ja");

    // 実行と検証
    expect(new JaKeyNotFoundError({ key: "foo" }).message).toBe("foo というキーは存在しません");
  });

  test("複数の言語タグに一度に固定文字列のメッセージを登録できる", ({ expect, setLang }) => {
    // 準備
    class RateLimitedError extends SampleKeyNotFoundError {}
    setErrorMessage(RateLimitedError, "Rate limited", ["ja", "fr"]);

    // 実行と検証
    setLang("ja");
    expect(new RateLimitedError({ key: "foo" }).message).toBe("Rate limited");

    setLang("fr");
    expect(new RateLimitedError({ key: "foo" }).message).toBe("Rate limited");
  });

  test("登録されていない言語では既定のメッセージにフォールバックする", ({ expect, setLang }) => {
    // 準備
    class JaOnlyKeyNotFoundError extends SampleKeyNotFoundError {}
    setErrorMessage(JaOnlyKeyNotFoundError, ({ key }) => `${key} というキーは存在しません`, "ja");
    setLang("fr");

    // 実行と検証
    expect(new JaOnlyKeyNotFoundError({ key: "foo" }).message).toBe("Key not found: foo");
  });

  test("message へのアクセスごとに現在の言語でメッセージを解決する", ({ expect, setLang }) => {
    // 準備
    const error = new SampleKeyNotFoundError({ key: "foo" });

    // 実行と検証
    expect(error.message).toBe("Key not found: foo");

    setErrorMessage(SampleKeyNotFoundError, ({ key }) => `${key} というキーは存在しません`, "ja");
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

describe("RepairNotAllowedError", () => {
  test("ErrorBase と globalThis.Error を継承する", ({ expect }) => {
    // 実行
    const error = new RepairNotAllowedError({ name: "Memory" });

    // 検証
    expect(error).toBeInstanceOf(globalThis.Error);
    expect(error).toBeInstanceOf(ErrorBase);
    expect(error).toBeInstanceOf(RepairNotAllowedError);
  });

  test("meta にストレージ名を保持する", ({ expect }) => {
    // 実行
    const error = new RepairNotAllowedError({ name: "Memory" });

    // 検証
    expect(error.meta).toStrictEqual({ name: "Memory" });
  });

  test("既定のメッセージはストレージ名を含む", ({ expect }) => {
    // 実行と検証
    expect(new RepairNotAllowedError({ name: "Memory" }).message).toBe(
      'Storage "Memory" does not allow repair writes',
    );
  });

  test("日本語では書き戻し拒否のメッセージを返す", ({ expect, setLang }) => {
    // 準備
    setLang("ja");

    // 実行と検証
    expect(new RepairNotAllowedError({ name: "Memory" }).message).toBe(
      'ストレージ "Memory" は書き戻しを許可していません',
    );
  });
});

describe("KeyNotFoundError", () => {
  test("ErrorBase を継承し name は UniKvsKeyNotFoundError である", ({ expect }) => {
    const error = new KeyNotFoundError({ key: "k1" });

    expect(error).toBeInstanceOf(globalThis.Error);
    expect(error).toBeInstanceOf(ErrorBase);
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect(error.name).toBe("UniKvsKeyNotFoundError");
  });

  test("meta にキーを保持する", ({ expect }) => {
    expect(new KeyNotFoundError({ key: "k1" }).meta).toStrictEqual({ key: "k1" });
  });

  test("既定のメッセージはキーを含む", ({ expect }) => {
    expect(new KeyNotFoundError({ key: "k1" }).message).toBe("Key not found: k1");
  });

  test("日本語ではキーを含むメッセージを返す", ({ expect, setLang }) => {
    setLang("ja");

    expect(new KeyNotFoundError({ key: "k1" }).message).toBe("キー k1 が見つかりません");
  });
});

describe("UnsupportedRuntimeError", () => {
  test("InvalidUsageErrorBase を継承し name は UniKvsUnsupportedRuntimeError である", ({
    expect,
  }) => {
    const error = new UnsupportedRuntimeError({ name: "Redis", runtime: "Bun" });

    expect(error).toBeInstanceOf(globalThis.Error);
    expect(error).toBeInstanceOf(ErrorBase);
    expect(error).toBeInstanceOf(InvalidUsageErrorBase);
    expect(error).toBeInstanceOf(UnsupportedRuntimeError);
    expect(error.name).toBe("UniKvsUnsupportedRuntimeError");
  });

  test("meta に名前とランタイムを保持する", ({ expect }) => {
    expect(new UnsupportedRuntimeError({ name: "Redis", runtime: "Bun" }).meta).toStrictEqual({
      name: "Redis",
      runtime: "Bun",
    });
  });

  test("既定のメッセージは名前とランタイムを含む", ({ expect }) => {
    expect(new UnsupportedRuntimeError({ name: "Redis", runtime: "Bun" }).message).toBe(
      "Redis can only be used in the Bun runtime",
    );
  });

  test("日本語ではランタイム制約のメッセージを返す", ({ expect, setLang }) => {
    setLang("ja");

    expect(new UnsupportedRuntimeError({ name: "Redis", runtime: "Bun" }).message).toBe(
      "Redis は Bun ランタイムでのみ使用できます",
    );
  });
});

describe("InvalidPartSizeError", () => {
  test("ErrorBase を継承し name は UniKvsInvalidPartSizeError である", ({ expect }) => {
    const error = new InvalidPartSizeError({ actual: 0 });

    expect(error).toBeInstanceOf(globalThis.Error);
    expect(error).toBeInstanceOf(ErrorBase);
    expect(error).toBeInstanceOf(InvalidPartSizeError);
    expect(error.name).toBe("UniKvsInvalidPartSizeError");
  });

  test("meta に実際の値を保持する", ({ expect }) => {
    expect(new InvalidPartSizeError({ actual: 0 }).meta).toStrictEqual({ actual: 0 });
  });

  test("既定のメッセージは実際の値を含む", ({ expect }) => {
    expect(new InvalidPartSizeError({ actual: 0 }).message).toContain("Invalid part size 0");
  });

  test("日本語ではパートサイズ不正のメッセージを返す", ({ expect, setLang }) => {
    setLang("ja");

    expect(new InvalidPartSizeError({ actual: 0 }).message).toContain("無効なパートサイズ 0");
  });
});

describe("StorageAbortedError", () => {
  test("ErrorBase を継承し name は UniKvsStorageAbortedError である", ({ expect }) => {
    const error = new StorageAbortedError({ key: "k1" });

    expect(error).toBeInstanceOf(globalThis.Error);
    expect(error).toBeInstanceOf(ErrorBase);
    expect(error).toBeInstanceOf(StorageAbortedError);
    expect(error.name).toBe("UniKvsStorageAbortedError");
  });

  test("meta にキーを保持する", ({ expect }) => {
    expect(new StorageAbortedError({ key: "k1" }).meta).toStrictEqual({ key: "k1" });
  });

  test("既定のメッセージはキーを含む", ({ expect }) => {
    expect(new StorageAbortedError({ key: "k1" }).message).toContain('"k1"');
  });

  test("日本語では中断のメッセージを返す", ({ expect, setLang }) => {
    setLang("ja");

    expect(new StorageAbortedError({ key: "k1" }).message).toContain('"k1"');
  });
});
