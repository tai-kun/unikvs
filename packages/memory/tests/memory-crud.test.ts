import { describe, test as vitest } from "vitest";

import { KeyNotFoundError } from "../src/errors.js";
import Memory from "../src/memory.js";

/**
 * テストごとに空の Memory インスタンスを提供します。
 * CRUD 操作の不変条件を検証するために使用します。
 */
const test = vitest.extend<{ storage: Memory }>({
  // oxlint-disable-next-line no-empty-pattern
  async storage({}, use) {
    await use(new Memory());
  },
});

describe("CRUD の不変条件", () => {
  test("削除したキーの read は KeyNotFoundError を投げる", ({ expect, storage }) => {
    // 準備
    storage.write({ vars: {}, key: "k1", data: "v1" });

    // 実行
    storage.delete({ key: "k1" });

    // 検証
    expect(() => storage.read({ key: "k1" })).toThrow(KeyNotFoundError);
  });

  test("clear したキーの read は KeyNotFoundError を投げる", ({ expect, storage }) => {
    // 準備
    storage.write({ vars: {}, key: "k1", data: "v1" });

    // 実行
    storage.clear();

    // 検証
    expect(() => storage.read({ key: "k1" })).toThrow(KeyNotFoundError);
  });

  test("空のストレージに clear を呼んでもエラーにならない", ({ expect, storage }) => {
    // 実行と検証
    expect(() => storage.clear()).not.toThrow();
    expect(storage.exists({ key: "k1" })).toBe(false);
  });

  test("undefined を保存したキーの exists は true を返す", ({ expect, storage }) => {
    // 準備
    storage.write({ vars: {}, key: "k1", data: undefined });

    // 実行
    const exists = storage.exists({ key: "k1" });

    // 検証
    expect(exists).toBe(true);
  });

  test("削除したキーへ再度書き込みできる", ({ expect, storage }) => {
    // 準備
    storage.write({ vars: {}, key: "k1", data: "v1" });
    storage.delete({ key: "k1" });

    // 実行
    storage.write({ vars: {}, key: "k1", data: "v2" });

    // 検証
    expect(storage.read({ key: "k1" })).toBe("v2");
  });

  test("clear したキーへ再度書き込みできる", ({ expect, storage }) => {
    // 準備
    storage.write({ vars: {}, key: "k1", data: "v1" });
    storage.clear();

    // 実行
    storage.write({ vars: {}, key: "k1", data: "v2" });

    // 検証
    expect(storage.read({ key: "k1" })).toBe("v2");
  });
});
