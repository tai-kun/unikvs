import { describe, test as vitest } from "vitest";

import LocalStorage from "../src/localstorage.js";
import { createFakeStorage } from "./_helpers.js";

const { signal } = new AbortController();

/**
 * テストごとに既定 prefix の LocalStorage と背後 Storage を提供します。
 * 実キーへの prefix 付与を間接検証するために使用します。
 */
const test = vitest.extend<{ backend: Storage; storage: LocalStorage }>({
  // oxlint-disable-next-line no-empty-pattern
  async backend({}, use) {
    await use(createFakeStorage());
  },
  async storage({ backend }, use) {
    await use(new LocalStorage({ storage: backend }));
  },
});

describe("キーの扱い", () => {
  test("任意の文字列キーで保存と取得ができる", ({ expect, storage }) => {
    // 準備
    const keys = [
      "",
      " ",
      "path/to/key",
      "a:b:c",
      "日本語キー",
      "🔑",
      "line\nbreak",
      "nul\0key",
      "a".repeat(1000),
    ];

    // 実行
    for (const [index, key] of keys.entries()) {
      storage.write({ key, data: `v${index}`, vars: {}, signal });
    }

    // 検証
    for (const [index, key] of keys.entries()) {
      expect(storage.read({ key, signal })).toBe(`v${index}`);
      expect(storage.exists({ key, signal })).toBe(true);
    }
  });

  test("論理キーに既定 prefix を付与して保存する", ({ expect, backend, storage }) => {
    // 実行
    storage.write({ key: "k1", data: "v1", vars: {}, signal });

    // 検証
    expect(backend.getItem("unikvs:k1")).toBe("v1");
    expect(backend.getItem("k1")).toBe(null);
  });

  test("異なる keyPrefix のインスタンス間ではデータを共有しない", ({ expect, backend }) => {
    // 準備
    const storageA = new LocalStorage({ storage: backend, keyPrefix: "a:" });
    const storageB = new LocalStorage({ storage: backend, keyPrefix: "b:" });
    storageA.write({ key: "k1", data: "va", vars: {}, signal });

    // 実行と検証
    expect(storageB.exists({ key: "k1", signal })).toBe(false);
    expect(backend.getItem("a:k1")).toBe("va");
    expect(backend.getItem("b:k1")).toBe(null);
  });

  test("clear は prefix 配下のみ削除する", ({ expect, backend, storage }) => {
    // 準備
    storage.write({ key: "k1", data: "v1", vars: {}, signal });
    backend.setItem("other:k2", "v2");

    // 実行
    storage.clear({ signal });

    // 検証
    expect(storage.exists({ key: "k1", signal })).toBe(false);
    expect(backend.getItem("other:k2")).toBe("v2");
  });
});
