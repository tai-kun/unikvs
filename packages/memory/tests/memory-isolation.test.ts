import type { IStorage } from "@unikvs/core";
import {
  createGetContext,
  createHasContext,
  createSetContext,
  createClearContext,
  createDeleteContext,
} from "@unikvs/testing";
import { test as vitest, describe } from "vite-plus/test";

import Memory from "../src/memory.js";

/**
 * テストごとに独立した 2 つの Memory インスタンスを提供します。
 * インスタンス間・キー間でデータが混ざらないことを検証するために使用します。
 */
const test = vitest.extend<{
  storage: Memory;
  otherStorage: Memory;
}>({
  async storage({}, use) {
    await use(new Memory());
  },
  async otherStorage({}, use) {
    await use(new Memory());
  },
});
describe("インスタンスの隔離", () => {
  test("書き込みは他のインスタンスへ影響しない", ({ expect, storage, otherStorage }) => {
    // 実行：
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");

    // 検証：
    expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(true);
    expect(otherStorage.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(false);
  });

  test("削除は他のインスタンスへ影響しない", ({ expect, storage, otherStorage }) => {
    // 準備：
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    otherStorage.write(createSetContext("k1") as IStorage.WriteContext, "v2");

    // 実行：
    storage.delete(createDeleteContext("k1") as IStorage.DeleteContext);

    // 検証：
    expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(false);
    expect(otherStorage.read(createGetContext("k1") as IStorage.ReadContext)).toBe("v2");
  });

  test("clear は他のインスタンスへ影響しない", ({ expect, storage, otherStorage }) => {
    // 準備：
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    otherStorage.write(createSetContext("k1") as IStorage.WriteContext, "v2");

    // 実行：
    storage.clear(createClearContext() as IStorage.ClearContext);

    // 検証：
    expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(false);
    expect(otherStorage.read(createGetContext("k1") as IStorage.ReadContext)).toBe("v2");
  });
});
describe("キーの隔離", () => {
  test("1 つのキーの上書きは他のキーへ影響しない", ({ expect, storage }) => {
    // 準備：
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    storage.write(createSetContext("k2") as IStorage.WriteContext, "v2");

    // 実行：
    storage.write(createSetContext("k1") as IStorage.WriteContext, "updated");

    // 検証：
    expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).toBe("updated");
    expect(storage.read(createGetContext("k2") as IStorage.ReadContext)).toBe("v2");
  });

  test("1 つのキーの削除は他のキーへ影響しない", ({ expect, storage }) => {
    // 準備：
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    storage.write(createSetContext("k2") as IStorage.WriteContext, "v2");

    // 実行：
    storage.delete(createDeleteContext("k1") as IStorage.DeleteContext);

    // 検証：
    expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(false);
    expect(storage.read(createGetContext("k2") as IStorage.ReadContext)).toBe("v2");
  });

  test("ストリームの書き込み中でも他のキーの操作に影響しない", async ({ expect, storage }) => {
    // 準備：
    const writer = storage
      .getWritable(createSetContext("s1") as IStorage.GetWritableContext)
      .getWriter();

    // 実行：
    await writer.write(new Uint8Array([1]));

    storage.write(createSetContext("k2") as IStorage.WriteContext, new Uint8Array([2]));
    await writer.close();

    // 検証：
    expect(storage.read(createGetContext("s1") as IStorage.ReadContext)).toStrictEqual(
      new Uint8Array([1]),
    );
    expect(storage.read(createGetContext("k2") as IStorage.ReadContext)).toStrictEqual(
      new Uint8Array([2]),
    );
  });
});
