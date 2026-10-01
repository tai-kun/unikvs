import { describe, test as vitest } from "vitest";

import { deleteGlobalConfig, setGlobalConfig } from "../../core/node_modules/valibot/dist/index.js";
import { JsonUnsupportedValueError } from "../src/index.js";
import Json from "../src/json.js";

/**
 * 言語設定をテスト内でのみ変更するためのフィクスチャーです。
 * 設定した言語はテスト終了後に削除され、ほかのテストに影響しません。
 *
 * valibot は json の直接依存ではないため、@unikvs/core が使う実体を
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

/**
 * 一括の encode と decode で値を往復させます。
 */
function roundTrip(value: unknown): unknown {
  const json = new Json();

  return json.decode({ data: json.encode({ data: value }) });
}

describe("初期化と基本属性", () => {
  test("name プロパティは Json を返す", ({ expect }) => {
    // 準備
    const json = new Json();

    // 実行と検証
    expect(json.name).toBe("Json");
  });

  test("isOpen プロパティは常に true を返す", ({ expect }) => {
    // 準備
    const json = new Json();

    // 実行と検証
    expect(json.isOpen).toBe(true);
  });
});

describe("一括のラウンドトリップ", () => {
  const PRIMITIVES: { label: string; value: unknown }[] = [
    { label: "null", value: null },
    { label: "true", value: true },
    { label: "false", value: false },
    { label: "0", value: 0 },
    { label: "1", value: 1 },
    { label: "-1", value: -1 },
    { label: "42", value: 42 },
    { label: "0.5", value: 0.5 },
    { label: "-0.5", value: -0.5 },
    { label: "1e21", value: 1e21 },
    { label: "1e-7", value: 1e-7 },
    { label: "空文字列", value: "" },
    { label: "ASCII 文字列", value: "hello" },
    { label: "日本語文字列", value: "日本語" },
    { label: "絵文字", value: "😀" },
    { label: "サロゲートペア", value: "𠮷野家" },
    { label: "NUL 文字", value: "\u0000" },
    { label: "改行を含む文字列", value: "line\nbreak" },
  ];

  test.for(PRIMITIVES)("プリミティブ $label を往復すると元の値に戻る", ({ value }, { expect }) => {
    // 実行と検証
    expect(roundTrip(value)).toStrictEqual(value);
  });

  test("ネストしたオブジェクトと配列を往復すると元の値に戻る", ({ expect }) => {
    // 準備
    const value = {
      name: "unikvs",
      version: 13,
      enabled: true,
      tags: ["json", "transformer", null],
      nested: {
        ratio: 0.25,
        empty: {},
        list: [],
        values: [1, "two", false, { deep: null }],
      },
    };

    // 実行と検証
    expect(roundTrip(value)).toStrictEqual(value);
  });

  test("空文字列と 0 と false を往復すると元の値に戻る", ({ expect }) => {
    // 実行と検証
    expect(roundTrip("")).toBe("");
    expect(roundTrip(0)).toBe(0);
    expect(roundTrip(false)).toBe(false);
  });

  test("負のゼロは 0 として往復する", ({ expect }) => {
    // 実行
    const decoded = roundTrip(-0);

    // 検証
    expect(Object.is(decoded, -0)).toBe(false);
    expect(Object.is(decoded, 0)).toBe(true);
  });

  test("1 MiB の値を往復すると元の値に戻る", ({ expect }) => {
    // 準備
    const value = {
      text: "a".repeat(1024 * 1024),
      unicode: "😀".repeat(1024),
    };

    // 実行
    const encoded = new Json().encode({ data: value });
    const decoded = new Json().decode({ data: encoded });

    // 検証
    expect(encoded.length).toBeGreaterThanOrEqual(1024 * 1024);
    expect(decoded).toStrictEqual(value);
  });

  test("NaN と Infinity は null として往復する", ({ expect }) => {
    // 実行と検証
    expect(roundTrip(Number.NaN)).toBeNull();
    expect(roundTrip(Number.POSITIVE_INFINITY)).toBeNull();
    expect(roundTrip(Number.NEGATIVE_INFINITY)).toBeNull();
  });

  test("Date は ISO 8601 文字列として往復する", ({ expect }) => {
    // 準備
    const value = new Date("2024-01-02T03:04:05.000Z");

    // 実行と検証
    expect(roundTrip(value)).toBe("2024-01-02T03:04:05.000Z");
  });

  test("toJSON を実装したオブジェクトはその結果を往復する", ({ expect }) => {
    // 準備
    const value = {
      toJSON() {
        return { replaced: true };
      },
    };

    // 実行と検証
    expect(roundTrip(value)).toStrictEqual({ replaced: true });
  });
});

describe("decode の異常系", () => {
  test("空のバイト列は SyntaxError で拒否される", ({ expect }) => {
    // 準備
    const json = new Json();

    // 実行と検証
    expect(() => json.decode({ data: new Uint8Array(0) })).toThrow(SyntaxError);
  });

  test("不正な JSON は SyntaxError で拒否される", ({ expect }) => {
    // 準備
    const json = new Json();
    const decoder = new TextEncoder();

    // 実行と検証
    for (const text of ["{", "[1,", "not json", "undefined", "'single'"]) {
      expect(() => json.decode({ data: decoder.encode(text) }), text).toThrow(SyntaxError);
    }
  });

  test("JSON 値の後に続く内容は SyntaxError で拒否される", ({ expect }) => {
    // 準備
    const json = new Json();
    const decoder = new TextEncoder();

    // 実行と検証
    for (const text of ["1 2", "null null", "{}[]", "1\n2"]) {
      expect(() => json.decode({ data: decoder.encode(text) }), text).toThrow(SyntaxError);
    }
  });

  test("不正な UTF-8 は TypeError で拒否される", ({ expect }) => {
    // 準備
    const json = new Json();

    // 実行と検証
    expect(() => json.decode({ data: Uint8Array.from([0xff]) })).toThrow(TypeError);
    expect(() => json.decode({ data: Uint8Array.from([0x22, 0xe3]) })).toThrow(TypeError);
  });
});

describe("encode の異常系", () => {
  const UNSUPPORTED: { value: unknown; type: string }[] = [
    { value: undefined, type: "undefined" },
    { value: () => undefined, type: "function" },
    { value: Symbol("test"), type: "symbol" },
  ];

  test.for(UNSUPPORTED)(
    "$type は JsonUnsupportedValueError で拒否される",
    ({ value, type }, { expect }) => {
      // 準備
      const json = new Json();

      // 実行
      let thrown: unknown;
      try {
        json.encode({ data: value });
      } catch (error) {
        thrown = error;
      }

      // 検証
      expect(thrown).toBeInstanceOf(JsonUnsupportedValueError);
      expect(thrown).toBeInstanceOf(globalThis.Error);
      expect((thrown as JsonUnsupportedValueError).name).toBe("UniKvsJsonUnsupportedValueError");
      expect((thrown as JsonUnsupportedValueError).meta).toStrictEqual({ type });
      expect((thrown as JsonUnsupportedValueError).message).toBe(
        `JSON cannot serialize a value of type ${type}`,
      );
    },
  );

  test("BigInt はネイティブの TypeError で拒否される", ({ expect }) => {
    // 準備
    const json = new Json();

    // 実行と検証
    expect(() => json.encode({ data: 1n })).toThrow(TypeError);
    expect(() => json.encode({ data: 1n })).not.toThrow(JsonUnsupportedValueError);
  });
});

describe("JsonUnsupportedValueError", () => {
  test("meta に type を保持し、既定では英語メッセージを返す", ({ expect }) => {
    // 実行
    const error = new JsonUnsupportedValueError({ type: "symbol" });

    // 検証
    expect(error.name).toBe("UniKvsJsonUnsupportedValueError");
    expect(error.meta).toStrictEqual({ type: "symbol" });
    expect(error.message).toBe("JSON cannot serialize a value of type symbol");
  });

  test("言語設定が日本語なら日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備
    const error = new JsonUnsupportedValueError({ type: "undefined" });

    // 実行
    setLang("ja");

    // 検証
    expect(error.message).toBe("型 undefined の値は JSON にシリアライズできません");
  });
});
