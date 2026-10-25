import { setGlobalConfig, deleteGlobalConfig } from "valibot";
import { test as vitest, describe } from "vite-plus/test";

// oxlint-disable unicorn/number-literal-case
import { type ErrorOptions, ErrorBase, setErrorMessage } from "../src/errors.js";

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

const seed = 20_260_930;
const cases = 100;

/**
 * mulberry32 による決定的な擬似乱数生成器です。
 */
function createRandom(initialSeed: number): {
  uint(max?: number): number;
  string(length: number): string;
} {
  let state = initialSeed >>> 0;
  const next = (): number => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";

  return {
    uint(max = 0xff_ff_ff_ff): number {
      return Math.floor(next() * (max + 1));
    },
    string(length: number): string {
      let result = "";

      for (let index = 0; index < length; index++) {
        result += alphabet.charAt(Math.floor(next() * alphabet.length));
      }

      return result;
    },
  };
}

/**
 * 決定的な乱数で count 回テスト本体を実行します。
 */
function forCases(
  baseSeed: number,
  count: number,
  run: (random: ReturnType<typeof createRandom>, index: number) => void,
): void {
  for (let index = 0; index < count; index++) {
    run(createRandom((baseSeed ^ Math.imul(index + 1, 0x9e_37_79_b9)) >>> 0), index);
  }
}

/**
 * 決定的な乱数で重複のないランダムなエントリー配列を生成します。
 */
function createRandomEntries(
  random: ReturnType<typeof createRandom>,
  length: number,
): [string, string][] {
  const entries: [string, string][] = [];
  const keys = new Set<string>();

  for (let attempt = 0; entries.length < length && attempt < length * 4; attempt++) {
    const entryKey = random.string(random.uint(8));

    if (keys.has(entryKey)) {
      continue;
    }

    keys.add(entryKey);
    entries.push([entryKey, random.string(random.uint(8))]);
  }

  return entries;
}

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
    // 準備：
    const assertKey = (key: string): void => {
      const error = new KeyNotFoundError({ key });
      expect(error.meta).toStrictEqual({ key });
      expect(error.message).toBe(`Key not found: ${key}`);
    };

    // 実行と検証：
    for (const key of keyEdgeCases) {
      assertKey(key);
    }

    forCases(seed, cases, (random) => {
      assertKey(random.string(random.uint(12)));
    });
  });

  test("任意の文字列キーに対して登録した日本語メッセージが一致する", ({ expect, setLang }) => {
    // 準備：
    class LocalizedError extends KeyNotFoundError {}

    setErrorMessage(LocalizedError, ({ key }) => `キー ${key} が見つかりません`, "ja");
    setLang("ja");

    const assertKey = (key: string): void => {
      expect(new LocalizedError({ key }).message).toBe(`キー ${key} が見つかりません`);
    };

    // 実行と検証：
    for (const key of keyEdgeCases) {
      assertKey(key);
    }

    forCases(seed + 1, cases, (random) => {
      assertKey(random.string(random.uint(12)));
    });
  });

  test("任意のメタ情報オブジェクトを参照として保持しメッセージ生成に使う", ({ expect }) => {
    // 準備：
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

    // 実行と検証：
    for (const meta of metaEdgeCases) {
      assertMeta(meta);
    }

    forCases(seed + 2, cases, (random) => {
      const entries = createRandomEntries(random, random.uint(6));
      assertMeta(Object.fromEntries(entries));
    });
  });
});
