import { deleteGlobalConfig, setGlobalConfig } from "valibot";
import { describe, test as vitest } from "vitest";

import { ErrorBase, type ErrorOptions, setErrorMessage } from "../src/errors.js";
import { forCases } from "./_random.js";

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

const seed = 20260930;
const cases = 100;

type KeyNotFoundErrorArgs = {
  readonly key: string;
};

/**
 * 任意の文字列キーに対して meta とメッセージが正しく生成されるかを検証するためのサンプルエラーです。
 */
class KeyNotFoundError extends ErrorBase<KeyNotFoundErrorArgs> {
  static {
    this.prototype.name = "KeyNotFoundError";
  }

  public constructor(args: KeyNotFoundErrorArgs, options?: ErrorOptions) {
    super(args, ({ key }) => `Key not found: ${key}`, options);
  }
}

const keyEdgeCases: string[] = [
  "",
  "a",
  "foo",
  "キー",
  "a/b\\c",
  "line\nbreak",
  "😀",
  "x".repeat(100),
];

const metaEdgeCases: Record<string, string>[] = [{}, { key: "" }, { "": "" }, { "a/b": "c" }];

describe("ErrorBase のプロパティー", () => {
  test("任意の文字列キーに対して meta と既定の英語メッセージが一致する", ({ expect }) => {
    // 準備
    const assertKey = (key: string): void => {
      const error = new KeyNotFoundError({ key });
      expect(error.meta).toStrictEqual({ key });
      expect(error.message).toBe(`Key not found: ${key}`);
    };

    // 実行と検証
    for (const key of keyEdgeCases) {
      assertKey(key);
    }

    forCases(seed, cases, (random) => {
      assertKey(random.string(random.uint(12)));
    });
  });

  test("任意の文字列キーに対して登録した日本語メッセージが一致する", ({ expect, setLang }) => {
    // 準備
    class LocalizedError extends KeyNotFoundError {}
    setErrorMessage(LocalizedError, ({ key }) => `キー ${key} が見つかりません`, "ja");
    setLang("ja");

    const assertKey = (key: string): void => {
      expect(new LocalizedError({ key }).message).toBe(`キー ${key} が見つかりません`);
    };

    // 実行と検証
    for (const key of keyEdgeCases) {
      assertKey(key);
    }

    forCases(seed + 1, cases, (random) => {
      assertKey(random.string(random.uint(12)));
    });
  });

  test("任意のメタ情報オブジェクトを参照として保持しメッセージ生成に使う", ({ expect }) => {
    // 準備
    class MetaError extends ErrorBase<Record<string, string>> {
      public constructor(meta: Record<string, string>) {
        super(meta, (value) => Object.keys(value).sort().join("|"));
      }
    }

    const assertMeta = (meta: Record<string, string>): void => {
      const error = new MetaError(meta);
      expect(error.meta).toBe(meta);
      expect(error.message).toBe(Object.keys(meta).sort().join("|"));
    };

    // 実行と検証
    for (const meta of metaEdgeCases) {
      assertMeta(meta);
    }

    forCases(seed + 2, cases, (random) => {
      const entries: [string, string][] = [];
      const keys = new Set<string>();
      const length = random.uint(6);
      for (let attempt = 0; entries.length < length && attempt < length * 4; attempt++) {
        const entryKey = random.string(random.uint(8));
        if (keys.has(entryKey)) {
          continue;
        }
        keys.add(entryKey);
        entries.push([entryKey, random.string(random.uint(8))]);
      }
      assertMeta(Object.fromEntries(entries));
    });
  });
});
