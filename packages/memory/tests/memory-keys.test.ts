import { describe, test } from "vitest";

import { KeyNotFoundError } from "../src/errors.js";
import Memory from "../src/memory.js";

const boundaryKeys: readonly { readonly label: string; readonly key: string }[] = [
  { label: "空文字", key: "" },
  { label: "1 文字", key: "a" },
  { label: "日本語", key: "キー" },
  { label: "絵文字", key: "🔑" },
  { label: "合成絵文字", key: "👨‍👩‍👧‍👦" },
  { label: "改行とタブ", key: "line\nbreak\t" },
  { label: "制御文字", key: "\u0000\u0001\u001f" },
  { label: "null バイトを含む文字列", key: "a\u0000b" },
  { label: "前後に空白を含む文字列", key: " a " },
  { label: "10 万文字", key: "k".repeat(100_000) },
  { label: "__proto__", key: "__proto__" },
  { label: "constructor", key: "constructor" },
  { label: "prototype", key: "prototype" },
  { label: "toString", key: "toString" },
  { label: "hasOwnProperty", key: "hasOwnProperty" },
];

describe("キーの境界値", () => {
  for (const { label, key } of boundaryKeys) {
    test(`${label} のキーでも保存・取得・削除できる`, ({ expect }) => {
      // 準備
      const storage = new Memory();

      // 実行
      storage.write({ vars: {}, key, data: "value" });

      // 検証
      expect(storage.read({ key })).toBe("value");
      expect(storage.exists({ key })).toBe(true);

      storage.delete({ key });
      expect(storage.exists({ key })).toBe(false);
      expect(() => storage.read({ key })).toThrow(KeyNotFoundError);
    });
  }
});

describe("キーの同一性", () => {
  test("大文字と小文字が異なるキーは区別される", ({ expect }) => {
    // 準備
    const storage = new Memory();

    // 実行
    storage.write({ vars: {}, key: "Key", data: "upper" });
    storage.write({ vars: {}, key: "key", data: "lower" });

    // 検証
    expect(storage.read({ key: "Key" })).toBe("upper");
    expect(storage.read({ key: "key" })).toBe("lower");
    expect(storage.exists({ key: "KEY" })).toBe(false);
  });

  test("空白だけが異なるキーは区別される", ({ expect }) => {
    // 準備
    const storage = new Memory();

    // 実行
    storage.write({ vars: {}, key: "k", data: "plain" });
    storage.write({ vars: {}, key: " k ", data: "padded" });

    // 検証
    expect(storage.read({ key: "k" })).toBe("plain");
    expect(storage.read({ key: " k " })).toBe("padded");
  });

  test("同じ文字列のキーへ書き込むと同じ値を上書きする", ({ expect }) => {
    // 準備
    const storage = new Memory();

    // 実行
    storage.write({ vars: {}, key: "k1", data: "first" });
    storage.write({ vars: {}, key: `k${1}`, data: "second" });

    // 検証
    expect(storage.read({ key: "k1" })).toBe("second");
  });
});

describe("プロトタイプ汚染キー", () => {
  test("__proto__ へ書き込んでも Object.prototype を汚染しない", ({ expect }) => {
    // 準備
    const storage = new Memory();

    // 実行
    storage.write({ vars: {}, key: "__proto__", data: { polluted: true } });

    // 検証
    expect(storage.read({ key: "__proto__" })).toStrictEqual({ polluted: true });
    expect(({} as Record<string, unknown>)["polluted"]).toBe(undefined);
    expect(Object.prototype).not.toHaveProperty("polluted");
  });

  test("constructor へ書き込んでも既存のキーは影響を受けない", ({ expect }) => {
    // 準備
    const storage = new Memory();
    storage.write({ vars: {}, key: "k1", data: "v1" });

    // 実行
    storage.write({ vars: {}, key: "constructor", data: "shadowed" });

    // 検証
    expect(storage.read({ key: "constructor" })).toBe("shadowed");
    expect(storage.read({ key: "k1" })).toBe("v1");
  });
});
