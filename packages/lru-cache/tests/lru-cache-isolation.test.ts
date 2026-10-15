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

import LruCache from "../src/lru-cache.js";

/**
 * テストごとに独立した 2 つの LruCache インスタンスを提供します。
 * インスタンス間・キー間でデータが混ざらないことを検証するために使用します。
 */
const test = vitest.extend<{ storage: LruCache; otherStorage: LruCache }>({
  // oxlint-disable-next-line no-empty-pattern
  async storage({}, use) {
    const storage = new LruCache();
    await storage.open(createOpenContext() as IStorage.OpenContext);
    await use(storage);
  },
  // oxlint-disable-next-line no-empty-pattern
  async otherStorage({}, use) {
    const storage = new LruCache();
    await storage.open(createOpenContext() as IStorage.OpenContext);
    await use(storage);
  },
});

describe("インスタンスの隔離", () => {
  test("書き込みは他のインスタンスへ影響しない", ({ expect, storage, otherStorage }) => {
    // 実行
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");

    // 検証
    expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(true);
    expect(otherStorage.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(false);
  });

  test("削除は他のインスタンスへ影響しない", ({ expect, storage, otherStorage }) => {
    // 準備
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    otherStorage.write(createSetContext("k1") as IStorage.WriteContext, "v2");

    // 実行
    storage.delete(createDeleteContext("k1") as IStorage.DeleteContext);

    // 検証
    expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(false);
    expect(otherStorage.read(createGetContext("k1") as IStorage.ReadContext)).toBe("v2");
  });

  test("clear は他のインスタンスへ影響しない", ({ expect, storage, otherStorage }) => {
    // 準備
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    otherStorage.write(createSetContext("k1") as IStorage.WriteContext, "v2");

    // 実行
    storage.clear(createClearContext() as IStorage.ClearContext);

    // 検証
    expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(false);
    expect(otherStorage.read(createGetContext("k1") as IStorage.ReadContext)).toBe("v2");
  });

  test("追い出しは他のインスタンスへ影響しない", async ({ expect, signal }) => {
    // 準備
    const limited = new LruCache({ maxEntries: 2 });
    const other = new LruCache({ maxEntries: 2 });
    await limited.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await other.open(createOpenContext({ signal }) as IStorage.OpenContext);
    limited.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    limited.write(createSetContext("k2") as IStorage.WriteContext, "v2");
    other.write(createSetContext("k1") as IStorage.WriteContext, "other");

    // 実行
    limited.write(createSetContext("k3") as IStorage.WriteContext, "v3");

    // 検証
    expect(limited.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(false);
    expect(other.read(createGetContext("k1") as IStorage.ReadContext)).toBe("other");
    expect(other.size).toBe(1);
  });
});

describe("キーの隔離", () => {
  test("1 つのキーの上書きは他のキーへ影響しない", ({ expect, storage }) => {
    // 準備
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    storage.write(createSetContext("k2") as IStorage.WriteContext, "v2");

    // 実行
    storage.write(createSetContext("k1") as IStorage.WriteContext, "updated");

    // 検証
    expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).toBe("updated");
    expect(storage.read(createGetContext("k2") as IStorage.ReadContext)).toBe("v2");
  });

  test("1 つのキーの削除は他のキーへ影響しない", ({ expect, storage }) => {
    // 準備
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    storage.write(createSetContext("k2") as IStorage.WriteContext, "v2");

    // 実行
    storage.delete(createDeleteContext("k1") as IStorage.DeleteContext);

    // 検証
    expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(false);
    expect(storage.read(createGetContext("k2") as IStorage.ReadContext)).toBe("v2");
  });

  test("ストリームの書き込み中でも他のキーの操作に影響しない", async ({ expect, storage }) => {
    // 準備
    const writer = storage
      .getWritable(createSetContext("s1") as IStorage.GetWritableContext)
      .getWriter();

    // 実行
    await writer.write(new Uint8Array([1]));
    storage.write(createSetContext("k2") as IStorage.WriteContext, new Uint8Array([2]));
    await writer.close();

    // 検証
    expect(storage.read(createGetContext("s1") as IStorage.ReadContext)).toStrictEqual(
      new Uint8Array([1]),
    );
    expect(storage.read(createGetContext("k2") as IStorage.ReadContext)).toStrictEqual(
      new Uint8Array([2]),
    );
  });
});
