import { describe, test as vitest } from "vitest";

import Memory from "../src/memory.js";

/**
 * テストごとに独立した 2 つの Memory インスタンスを提供します。
 * インスタンス間・キー間でデータが混ざらないことを検証するために使用します。
 */
const test = vitest.extend<{ storage: Memory; otherStorage: Memory }>({
  // oxlint-disable-next-line no-empty-pattern
  async storage({}, use) {
    await use(new Memory());
  },
  // oxlint-disable-next-line no-empty-pattern
  async otherStorage({}, use) {
    await use(new Memory());
  },
});

describe("インスタンスの隔離", () => {
  test("書き込みは他のインスタンスへ影響しない", ({ expect, storage, otherStorage }) => {
    // 実行
    storage.write({ key: "k1", data: "v1" });

    // 検証
    expect(storage.exists({ key: "k1" })).toBe(true);
    expect(otherStorage.exists({ key: "k1" })).toBe(false);
  });

  test("削除は他のインスタンスへ影響しない", ({ expect, storage, otherStorage }) => {
    // 準備
    storage.write({ key: "k1", data: "v1" });
    otherStorage.write({ key: "k1", data: "v2" });

    // 実行
    storage.delete({ key: "k1" });

    // 検証
    expect(storage.exists({ key: "k1" })).toBe(false);
    expect(otherStorage.read({ key: "k1" })).toBe("v2");
  });

  test("clear は他のインスタンスへ影響しない", ({ expect, storage, otherStorage }) => {
    // 準備
    storage.write({ key: "k1", data: "v1" });
    otherStorage.write({ key: "k1", data: "v2" });

    // 実行
    storage.clear();

    // 検証
    expect(storage.exists({ key: "k1" })).toBe(false);
    expect(otherStorage.read({ key: "k1" })).toBe("v2");
  });
});

describe("キーの隔離", () => {
  test("1 つのキーの上書きは他のキーへ影響しない", ({ expect, storage }) => {
    // 準備
    storage.write({ key: "k1", data: "v1" });
    storage.write({ key: "k2", data: "v2" });

    // 実行
    storage.write({ key: "k1", data: "updated" });

    // 検証
    expect(storage.read({ key: "k1" })).toBe("updated");
    expect(storage.read({ key: "k2" })).toBe("v2");
  });

  test("1 つのキーの削除は他のキーへ影響しない", ({ expect, storage }) => {
    // 準備
    storage.write({ key: "k1", data: "v1" });
    storage.write({ key: "k2", data: "v2" });

    // 実行
    storage.delete({ key: "k1" });

    // 検証
    expect(storage.exists({ key: "k1" })).toBe(false);
    expect(storage.read({ key: "k2" })).toBe("v2");
  });

  test("ストリームの書き込み中でも他のキーの操作に影響しない", async ({ expect, storage }) => {
    // 準備
    const writer = storage.getWritable({ key: "s1" }).getWriter();

    // 実行
    await writer.write(new Uint8Array([1]));
    storage.write({ key: "k2", data: new Uint8Array([2]) });
    await writer.close();

    // 検証
    expect(storage.read({ key: "s1" })).toStrictEqual(new Uint8Array([1]));
    expect(storage.read({ key: "k2" })).toStrictEqual(new Uint8Array([2]));
  });
});
