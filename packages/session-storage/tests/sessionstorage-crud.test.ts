import { Variables } from "@unikvs/core";
import { describe, test as vitest } from "vitest";

import { KeyNotFoundError } from "../src/errors.js";
import SessionStorage from "../src/sessionstorage.js";
import { createFakeStorage } from "./_helpers.js";

const { signal } = new AbortController();

/**
 * テストごとに空の SessionStorage インスタンスを提供します。
 * CRUD 操作の不変条件を検証するために使用します。
 */
const test = vitest.extend<{ storage: SessionStorage }>({
  // oxlint-disable-next-line no-empty-pattern
  async storage({}, use) {
    await use(new SessionStorage({ storage: createFakeStorage() }));
  },
});

describe("CRUD の不変条件", () => {
  test("削除したキーの read は KeyNotFoundError を投げる", ({ expect, storage }) => {
    // 準備
    storage.write({ key: "k1", data: "v1", vars: new Variables(), signal });

    // 実行
    storage.delete({ key: "k1", signal });

    // 検証
    expect(() => storage.read({ key: "k1", signal })).toThrow(KeyNotFoundError);
  });

  test("clear したキーの read は KeyNotFoundError を投げる", ({ expect, storage }) => {
    // 準備
    storage.write({ key: "k1", data: "v1", vars: new Variables(), signal });

    // 実行
    storage.clear({ signal });

    // 検証
    expect(() => storage.read({ key: "k1", signal })).toThrow(KeyNotFoundError);
  });

  test("空のストレージに clear を呼んでもエラーにならない", ({ expect, storage }) => {
    // 実行と検証
    expect(() => storage.clear({ signal })).not.toThrow();
    expect(storage.exists({ key: "k1", signal })).toBe(false);
  });

  test("空文字を保存したキーの exists は true を返す", ({ expect, storage }) => {
    // 準備
    storage.write({ key: "k1", data: "", vars: new Variables(), signal });

    // 実行
    const exists = storage.exists({ key: "k1", signal });

    // 検証
    expect(exists).toBe(true);
  });

  test("空文字を保存したキーの read は空文字を返す", ({ expect, storage }) => {
    // 準備
    storage.write({ key: "k1", data: "", vars: new Variables(), signal });

    // 実行
    const result = storage.read({ key: "k1", signal });

    // 検証
    expect(result).toBe("");
  });

  test("削除したキーへ再度書き込みできる", ({ expect, storage }) => {
    // 準備
    storage.write({ key: "k1", data: "v1", vars: new Variables(), signal });
    storage.delete({ key: "k1", signal });

    // 実行
    storage.write({ key: "k1", data: "v2", vars: new Variables(), signal });

    // 検証
    expect(storage.read({ key: "k1", signal })).toBe("v2");
  });

  test("clear したキーへ再度書き込みできる", ({ expect, storage }) => {
    // 準備
    storage.write({ key: "k1", data: "v1", vars: new Variables(), signal });
    storage.clear({ signal });

    // 実行
    storage.write({ key: "k1", data: "v2", vars: new Variables(), signal });

    // 検証
    expect(storage.read({ key: "k1", signal })).toBe("v2");
  });

  test("欠番の delete は KeyNotFoundError を投げる", ({ expect, storage }) => {
    // 実行と検証
    expect(() => storage.delete({ key: "unknown", signal })).toThrow(KeyNotFoundError);
  });
});
