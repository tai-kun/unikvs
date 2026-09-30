import { describe } from "vitest";

import { captureRejection, test } from "./_helpers.js";

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
    test(`${label} のキーでも保存・取得・削除できる`, async ({ expect, storage }) => {
      // 準備
      await storage.open();

      // 実行
      await storage.write({ key, data: "value" });

      // 検証
      expect(await storage.read({ key })).toBe("value");
      expect(await storage.exists({ key })).toBe(true);

      await storage.delete({ key });
      expect(await storage.exists({ key })).toBe(false);
      expect(await captureRejection(storage.read({ key }))).toBeInstanceOf(DOMException);
    });
  }
});

describe("キーの同一性", () => {
  test("大文字と小文字が異なるキーは区別される", async ({ expect, storage }) => {
    // 準備
    await storage.open();

    // 実行
    await storage.write({ key: "Key", data: "upper" });
    await storage.write({ key: "key", data: "lower" });

    // 検証
    expect(await storage.read({ key: "Key" })).toBe("upper");
    expect(await storage.read({ key: "key" })).toBe("lower");
    expect(await storage.exists({ key: "KEY" })).toBe(false);
  });

  test("前後の空白だけが異なるキーは区別される", async ({ expect, storage }) => {
    // 準備
    await storage.open();

    // 実行
    await storage.write({ key: "k", data: "plain" });
    await storage.write({ key: " k ", data: "padded" });

    // 検証
    expect(await storage.read({ key: "k" })).toBe("plain");
    expect(await storage.read({ key: " k " })).toBe("padded");
  });

  test("同じ内容の文字列キーへ書き込むと同じ値を上書きする", async ({ expect, storage }) => {
    // 準備
    await storage.open();

    // 実行
    await storage.write({ key: "k1", data: "first" });
    await storage.write({ key: `k${1}`, data: "second" });

    // 検証
    expect(await storage.read({ key: "k1" })).toBe("second");
  });
});

describe("プロトタイプ汚染キー", () => {
  test("__proto__ へ書き込んでも Object.prototype を汚染しない", async ({ expect, storage }) => {
    // 準備
    await storage.open();

    // 実行
    await storage.write({ key: "__proto__", data: { polluted: true } });

    // 検証
    expect(await storage.read({ key: "__proto__" })).toStrictEqual({ polluted: true });
    expect(({} as Record<string, unknown>)["polluted"]).toBe(undefined);
    expect(Object.prototype).not.toHaveProperty("polluted");
  });

  test("constructor へ書き込んでも既存のキーは影響を受けない", async ({ expect, storage }) => {
    // 準備
    await storage.open();
    await storage.write({ key: "k1", data: "v1" });

    // 実行
    await storage.write({ key: "constructor", data: "shadowed" });

    // 検証
    expect(await storage.read({ key: "constructor" })).toBe("shadowed");
    expect(await storage.read({ key: "k1" })).toBe("v1");
  });
});
