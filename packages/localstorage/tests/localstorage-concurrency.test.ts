import { describe, test as vitest } from "vitest";

import LocalStorage from "../src/localstorage.js";
import { createFakeStorage } from "./_helpers.js";

const { signal } = new AbortController();

/**
 * テストごとに空の LocalStorage インスタンスを提供します。
 * 並列操作の確定性を検証するために使用します。
 */
const test = vitest.extend<{ storage: LocalStorage }>({
  // oxlint-disable-next-line no-empty-pattern
  async storage({}, use) {
    await use(new LocalStorage({ storage: createFakeStorage() }));
  },
});

describe("並列操作", () => {
  test("異なるキーへの並列書き込みはすべて保持される", ({ expect, storage }) => {
    // 準備
    const keys = ["k1", "k2", "k3", "k4"];

    // 実行
    for (const key of keys) {
      storage.write({ key, data: `v-${key}`, vars: {}, signal });
    }

    // 検証
    for (const key of keys) {
      expect(storage.read({ key, signal })).toBe(`v-${key}`);
    }
  });

  test("同一キーへの並列書き込みは最終書き勝ちで確定する", ({ expect, storage }) => {
    // 実行
    storage.write({ key: "k1", data: "v1", vars: {}, signal });
    storage.write({ key: "k1", data: "v2", vars: {}, signal });

    // 検証
    expect(storage.read({ key: "k1", signal })).toBe("v2");
  });
});
