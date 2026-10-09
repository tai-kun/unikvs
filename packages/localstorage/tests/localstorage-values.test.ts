import { describe, test as vitest } from "vitest";

import LocalStorage from "../src/localstorage.js";
import { createFakeStorage } from "./_helpers.js";

const { signal } = new AbortController();

/**
 * テストごとに空の LocalStorage インスタンスを提供します。
 * 文字列値の往復を検証するために使用します。
 */
const test = vitest.extend<{ storage: LocalStorage }>({
  // oxlint-disable-next-line no-empty-pattern
  async storage({}, use) {
    await use(new LocalStorage({ storage: createFakeStorage() }));
  },
});

describe("文字列値の往復", () => {
  test("空文字・空白を保存したとき、そのまま取得できる", ({ expect, storage }) => {
    // 準備
    const cases: [string, string][] = [
      ["empty", ""],
      ["spaces", "   "],
      ["tabs", "\t\n\r"],
    ];

    // 実行
    for (const [key, data] of cases) {
      storage.write({ key, data, vars: {}, signal });
    }

    // 検証
    for (const [key, data] of cases) {
      expect(storage.read({ key, signal })).toBe(data);
      expect(storage.exists({ key, signal })).toBe(true);
    }
  });

  test("Unicode・日本語・絵文字を保存したとき、そのまま取得できる", ({ expect, storage }) => {
    // 準備
    const cases: [string, string][] = [
      ["japanese", "こんにちは、世界"],
      ["emoji", "🎉🚀🔑"],
      ["surrogate", "𝟘𝟙𝟚"],
      ["mixed", "あa🎉\n改行あり"],
      ["accents", "café naïve résumé"],
    ];

    // 実行
    for (const [key, data] of cases) {
      storage.write({ key, data, vars: {}, signal });
    }

    // 検証
    for (const [key, data] of cases) {
      expect(storage.read({ key, signal })).toBe(data);
    }
  });

  test("改行を含む文字列を保存したとき、そのまま取得できる", ({ expect, storage }) => {
    // 準備
    const data = "1 行目\n2 行目\r\n3 行目\ttab 付き";

    // 実行
    storage.write({ key: "multiline", data, vars: {}, signal });

    // 検証
    expect(storage.read({ key: "multiline", signal })).toBe(data);
  });

  test("長大な文字列を保存したとき、そのまま取得できる", ({ expect, storage }) => {
    // 準備
    const data = "あ".repeat(1024 * 1024);

    // 実行
    storage.write({ key: "large", data, vars: {}, signal });

    // 検証
    expect(storage.read({ key: "large", signal })).toBe(data);
  });

  test("s:・b:・j: で始まる文字列を保存したとき、接頭辞を剥がさず取得できる", ({
    expect,
    storage,
  }) => {
    // 準備
    const cases: [string, string][] = [
      ["s", "s:foo"],
      ["b", "b:aGVsbG8="],
      ["j", 'j:{"a":1}'],
    ];

    // 実行
    for (const [key, data] of cases) {
      storage.write({ key, data, vars: {}, signal });
    }

    // 検証
    for (const [key, data] of cases) {
      expect(storage.read({ key, signal })).toBe(data);
    }
  });

  test("呼出側で JSON 文字列化した値を保存したとき、復元できる", ({ expect, storage }) => {
    // 準備
    const profile = { name: "aoba", tags: ["x", "y"], nested: { n: 1 } };
    const data = JSON.stringify(profile);

    // 実行
    storage.write({ key: "profile", data, vars: {}, signal });
    const restored = JSON.parse(storage.read({ key: "profile", signal }) as string);

    // 検証
    expect(restored).toStrictEqual(profile);
  });
});
