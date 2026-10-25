import type { IStorage } from "@unikvs/core";
import { createGetContext, createSetContext } from "@unikvs/testing";
import { test as vitest, describe } from "vite-plus/test";

import LocalStorage from "../src/localstorage.js";
import { createFakeStorage } from "./_helpers.js";

const { signal } = new AbortController();

/**
 * テストごとに空の LocalStorage インスタンスを提供します。
 * 並列操作の確定性を検証するために使用します。
 */
const test = vitest.extend<{ storage: LocalStorage }>({
  async storage({}, use) {
    await use(new LocalStorage({ storage: createFakeStorage() }));
  },
});
describe("並列操作", () => {
  test("異なるキーへの並列書き込みはすべて保持される", ({ expect, storage }) => {
    // 準備：
    const keys = ["k1", "k2", "k3", "k4"];

    // 実行：
    for (const key of keys) {
      storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, `v-${key}`);
    }

    // 検証：
    for (const key of keys) {
      expect(storage.read(createGetContext(key, { signal }) as IStorage.ReadContext)).toBe(
        `v-${key}`,
      );
    }
  });

  test("同一キーへの並列書き込みは最終書き勝ちで確定する", ({ expect, storage }) => {
    // 実行：
    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");
    storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v2");

    // 検証：
    expect(storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toBe("v2");
  });
});
