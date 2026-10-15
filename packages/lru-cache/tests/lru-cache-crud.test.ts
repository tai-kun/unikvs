import type { IStorage } from "@unikvs/core";
import {
  createDeleteContext,
  createGetContext,
  createHasContext,
  createOpenContext,
  createSetContext,
  createClearContext,
} from "@unikvs/testing";
import { describe, test as vitest } from "vitest";

import { KeyNotFoundError } from "../src/errors.js";
import LruCache from "../src/lru-cache.js";

/**
 * テストごとに open 済みの LruCache インスタンスを提供します。
 * CRUD 操作の不変条件を検証するために使用します。
 */
const test = vitest.extend<{ storage: LruCache }>({
  // oxlint-disable-next-line no-empty-pattern
  async storage({}, use) {
    const storage = new LruCache();
    await storage.open(createOpenContext() as IStorage.OpenContext);
    await use(storage);
  },
});

describe("CRUD の不変条件", () => {
  test("削除したキーの read は KeyNotFoundError を投げる", ({ expect, storage }) => {
    // 準備
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");

    // 実行
    storage.delete(createDeleteContext("k1") as IStorage.DeleteContext);

    // 検証
    expect(() => storage.read(createGetContext("k1") as IStorage.ReadContext)).toThrow(
      KeyNotFoundError,
    );
  });

  test("clear したキーの read は KeyNotFoundError を投げる", ({ expect, storage }) => {
    // 準備
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");

    // 実行
    storage.clear(createClearContext() as IStorage.ClearContext);

    // 検証
    expect(() => storage.read(createGetContext("k1") as IStorage.ReadContext)).toThrow(
      KeyNotFoundError,
    );
  });

  test("空のストレージに clear を呼んでもエラーにならない", ({ expect, storage }) => {
    // 実行と検証
    expect(() => storage.clear(createClearContext() as IStorage.ClearContext)).not.toThrow();
    expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(false);
  });

  test("undefined を保存したキーの exists は true を返す", ({ expect, storage }) => {
    // 準備
    storage.write(createSetContext("k1") as IStorage.WriteContext, undefined);

    // 実行
    const exists = storage.exists(createHasContext("k1") as IStorage.ExistsContext);

    // 検証
    expect(exists).toBe(true);
  });

  test("削除したキーへ再度書き込みできる", ({ expect, storage }) => {
    // 準備
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    storage.delete(createDeleteContext("k1") as IStorage.DeleteContext);

    // 実行
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v2");

    // 検証
    expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).toBe("v2");
  });

  test("clear したキーへ再度書き込みできる", ({ expect, storage }) => {
    // 準備
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    storage.clear(createClearContext() as IStorage.ClearContext);

    // 実行
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v2");

    // 検証
    expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).toBe("v2");
  });

  test("存在しないキーの delete は KeyNotFoundError を投げる", ({ expect, storage }) => {
    // 実行と検証
    expect(() => storage.delete(createDeleteContext("unknown") as IStorage.DeleteContext)).toThrow(
      KeyNotFoundError,
    );
  });

  test("size は保存件数を返す", ({ expect, storage }) => {
    // 準備と実行
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    storage.write(createSetContext("k2") as IStorage.WriteContext, "v2");

    // 検証
    expect(storage.size).toBe(2);
  });
});
