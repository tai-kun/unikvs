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
  // oxlint-disable-next-line no-empty-pattern
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

/**
 * 言語ごとのメッセージ登録と解決を検証するためのサンプルエラーです。
 */
class KeyNotFoundError extends ErrorBase<KeyNotFoundErrorArgs> {
  static {
    this.prototype.name = "KeyNotFoundError";
  }

  public constructor(args: KeyNotFoundErrorArgs, options?: ErrorOptions) {
    super(args, ({ key }) => `Key not found: ${key}`, options);
  }
}

describe("setErrorMessage", () => {
  test("関数メッセージを言語ごとに登録すると言語切り替えで使い分けられる", ({
    expect,
    setLang,
  }) => {
    // 準備
    class LocalizedError extends KeyNotFoundError {}
    setErrorMessage(LocalizedError, ({ key }) => `${key} は存在しません`, "ja");
    setErrorMessage(LocalizedError, ({ key }) => `${key} is missing`, "en");

    // 実行と検証
    setLang("ja");
    expect(new LocalizedError({ key: "foo" }).message).toBe("foo は存在しません");

    setLang("en");
    expect(new LocalizedError({ key: "foo" }).message).toBe("foo is missing");
  });

  test("言語タグの Set でまとめて登録できる", ({ expect, setLang }) => {
    // 準備
    class SetLangError extends KeyNotFoundError {}
    setErrorMessage(SetLangError, "not found", new Set(["ja", "fr"]));

    // 実行と検証
    setLang("ja");
    expect(new SetLangError({ key: "foo" }).message).toBe("not found");

    setLang("fr");
    expect(new SetLangError({ key: "foo" }).message).toBe("not found");
  });

  test("同じ言語へ再登録すると新しいメッセージで上書きされる", ({ expect, setLang }) => {
    // 準備
    class OverwritableError extends KeyNotFoundError {}
    setErrorMessage(OverwritableError, "first", "ja");
    setErrorMessage(OverwritableError, "second", "ja");
    setLang("ja");

    // 実行と検証
    expect(new OverwritableError({ key: "foo" }).message).toBe("second");
  });

  test("登録したメッセージ関数は meta をそのまま受け取る", ({ expect, setLang }) => {
    // 準備
    let received: KeyNotFoundErrorArgs | undefined;
    class MetaCaptureError extends KeyNotFoundError {}
    setErrorMessage(
      MetaCaptureError,
      (meta) => {
        received = meta;
        return "captured";
      },
      "ja",
    );
    setLang("ja");
    const error = new MetaCaptureError({ key: "foo" });

    // 実行
    const message = error.message;

    // 検証
    expect(message).toBe("captured");
    expect(received).toBe(error.meta);
  });

  test("空文字列のメッセージが登録されていてもフォールバックしない", ({ expect, setLang }) => {
    // 準備
    class EmptyMessageError extends KeyNotFoundError {}
    setErrorMessage(EmptyMessageError, "", "ja");
    setLang("ja");

    // 実行と検証
    expect(new EmptyMessageError({ key: "foo" }).message).toBe("");
  });

  test("メッセージは登録したクラス単位で解決される", ({ expect, setLang }) => {
    // 準備
    class ParentError extends ErrorBase<undefined> {
      public constructor() {
        super("parent default");
      }
    }
    class ChildError extends ParentError {}
    setErrorMessage(ParentError, "parent ja", "ja");
    setErrorMessage(ChildError, "child ja", "ja");
    setLang("ja");

    // 実行と検証
    expect(new ParentError().message).toBe("parent ja");
    expect(new ChildError().message).toBe("child ja");
  });

  test("親クラスへの登録は子クラスへ継承されない", ({ expect, setLang }) => {
    // 準備
    class BaseError extends ErrorBase<undefined> {
      public constructor() {
        super("base default");
      }
    }
    class DerivedError extends BaseError {}
    setErrorMessage(BaseError, "base ja", "ja");
    setLang("ja");

    // 実行と検証
    expect(new DerivedError().message).toBe("base default");
  });

  test("prefix は翻訳後のメッセージにも付加される", ({ expect, setLang }) => {
    // 準備
    class PrefixedError extends KeyNotFoundError {}
    PrefixedError.prefix = "[test] ";
    setErrorMessage(PrefixedError, ({ key }) => `${key} がありません`, "ja");
    setLang("ja");

    // 実行と検証
    expect(new PrefixedError({ key: "foo" }).message).toBe("[test] foo がありません");
  });

  test("InvalidUsageErrorBase のサブクラスにも登録できる", ({ expect, setLang }) => {
    // 準備
    class InvalidError extends InvalidUsageErrorBase<undefined> {
      public constructor() {
        super("invalid default");
      }
    }
    setErrorMessage(InvalidError, "無効な使い方です", "ja");
    setLang("ja");

    // 実行と検証
    expect(new InvalidError().message).toBe("無効な使い方です");
  });

  test("言語設定を削除すると既定の英語メッセージに戻る", ({ expect, setLang }) => {
    // 準備
    class ResettableError extends KeyNotFoundError {}
    setErrorMessage(ResettableError, ({ key }) => `${key} は存在しません`, "ja");
    setLang("ja");

    // 実行と検証
    expect(new ResettableError({ key: "foo" }).message).toBe("foo は存在しません");

    deleteGlobalConfig();
    expect(new ResettableError({ key: "foo" }).message).toBe("Key not found: foo");
  });
});
