import { describe, test as vitest } from "vitest";

import LocalStorage from "../src/localstorage.js";
import { createFakeStorage } from "./_helpers.js";

const { signal } = new AbortController();

/**
 * テストごとに LocalStorage と背後 Storage の組を提供します。
 * 外部からの直接読み書きとの相互運用を検証するために使用します。
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

describe("他アプリとの相互運用", () => {
  test("他アプリが直接書いた値を素通しで読める", ({ expect, backend, storage }) => {
    // 準備
    backend.setItem("unikvs:direct", "hello");

    // 実行
    const result = storage.read({ key: "direct", signal });

    // 検証
    expect(result).toBe("hello");
  });

  test("本ストレージが書いた値を他アプリが素通しで読める", ({ expect, backend, storage }) => {
    // 実行
    storage.write({ key: "k1", data: "v1", vars: {}, signal });

    // 検証
    expect(backend.getItem("unikvs:k1")).toBe("v1");
  });

  test("書込呼び出しを記録しながら素通しで読める", ({ expect }) => {
    // 準備
    const calls: [string, string][] = [];
    const backend = createFakeStorage({
      onSetItem: (key, value) => {
        calls.push([key, value]);
      },
    });
    const storage = new LocalStorage({ storage: backend });

    // 実行
    storage.write({ key: "k1", data: "v1", vars: {}, signal });

    // 検証
    expect(calls).toStrictEqual([["unikvs:k1", "v1"]]);
    expect(storage.read({ key: "k1", signal })).toBe("v1");
  });
});
