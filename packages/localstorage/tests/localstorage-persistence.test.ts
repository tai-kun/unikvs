import { describe, test } from "vitest";

import LocalStorage from "../src/localstorage.js";
import {
  createFakeStorage,
  createKeyPrefix,
  createSharedBackend,
  runWithGlobalLocalStorage,
} from "./_helpers.js";

const { signal } = new AbortController();

describe("永続化と共有", () => {
  test("別インスタンスで同じ背後領域を開いてもデータを読み取れる", ({ expect }) => {
    // 準備
    const backend = createSharedBackend();
    const prefix = createKeyPrefix();
    const first = new LocalStorage({ storage: backend, keyPrefix: prefix });
    first.write({ key: "k1", data: "v1", vars: {}, signal });

    // 実行
    const second = new LocalStorage({ storage: backend, keyPrefix: prefix });

    // 検証
    expect(second.read({ key: "k1", signal })).toBe("v1");

    // 後始末
    second.clear({ signal });
  });

  test("注入なしでも背後領域を使える", ({ expect }) => {
    // 準備
    const prefix = createKeyPrefix();
    const globalBackend = (globalThis as { localStorage?: Storage | undefined }).localStorage;

    if (globalBackend) {
      // 実行
      const storage = new LocalStorage({ keyPrefix: prefix });
      storage.write({ key: "k1", data: "v1", vars: {}, signal });

      // 検証
      expect(storage.read({ key: "k1", signal })).toBe("v1");

      // 後始末
      storage.clear({ signal });
    } else {
      // 実行と検証
      runWithGlobalLocalStorage(createFakeStorage(), () => {
        const storage = new LocalStorage({ keyPrefix: prefix });
        storage.write({ key: "k1", data: "v1", vars: {}, signal });
        expect(storage.read({ key: "k1", signal })).toBe("v1");
        storage.clear({ signal });
      });
    }
  });

  test("clear して再度書き込むと空の状態から始められる", ({ expect }) => {
    // 準備
    const backend = createSharedBackend();
    const prefix = createKeyPrefix();
    const storage = new LocalStorage({ storage: backend, keyPrefix: prefix });
    storage.write({ key: "k1", data: "v1", vars: {}, signal });
    storage.clear({ signal });

    // 実行
    storage.write({ key: "k2", data: "v2", vars: {}, signal });

    // 検証
    expect(storage.exists({ key: "k1", signal })).toBe(false);
    expect(storage.read({ key: "k2", signal })).toBe("v2");

    // 後始末
    storage.clear({ signal });
  });

  test("同一 prefix は共有し異なる prefix は分離する", ({ expect }) => {
    // 準備
    const backend = createSharedBackend();
    const prefixA = createKeyPrefix();
    const prefixB = createKeyPrefix();
    const storageA1 = new LocalStorage({ storage: backend, keyPrefix: prefixA });
    const storageA2 = new LocalStorage({ storage: backend, keyPrefix: prefixA });
    const storageB = new LocalStorage({ storage: backend, keyPrefix: prefixB });
    storageA1.write({ key: "k1", data: "va", vars: {}, signal });

    // 実行と検証
    expect(storageA2.read({ key: "k1", signal })).toBe("va");
    expect(storageB.exists({ key: "k1", signal })).toBe(false);

    // 後始末
    storageA1.clear({ signal });
  });

  test("削除したデータは別インスタンスからも復活しない", ({ expect }) => {
    // 準備
    const backend = createSharedBackend();
    const prefix = createKeyPrefix();
    const first = new LocalStorage({ storage: backend, keyPrefix: prefix });
    first.write({ key: "k1", data: "v1", vars: {}, signal });
    first.delete({ key: "k1", signal });

    // 実行
    const second = new LocalStorage({ storage: backend, keyPrefix: prefix });

    // 検証
    expect(second.exists({ key: "k1", signal })).toBe(false);
  });
});
