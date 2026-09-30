import { describe } from "vitest";

import IndexeddbStorage from "../src/indexeddb.js";
import { STORE_NAME, test } from "./_helpers.js";

describe("永続化", () => {
  test("close して同じインスタンスで再度 open してもデータを読み取れる", async ({
    expect,
    storage,
  }) => {
    // 準備
    await storage.open();
    await storage.write({ key: "k1", data: { message: "hello" } });
    await storage.close();

    // 実行
    await storage.open();

    // 検証
    expect(await storage.read({ key: "k1" })).toStrictEqual({ message: "hello" });
  });

  test("別インスタンスで同じ DB を開いてもデータを読み取れる", async ({
    expect,
    dbName,
    storage,
  }) => {
    // 準備
    await storage.open();
    await storage.write({ key: "k1", data: "v1" });
    await storage.close();

    // 実行
    const second = new IndexeddbStorage(dbName, STORE_NAME);
    await second.open();

    try {
      // 検証
      expect(await second.read({ key: "k1" })).toBe("v1");
    } finally {
      await second.close();
    }
  });

  test("clear して再度 open すると空の状態になっている", async ({ expect, storage }) => {
    // 準備
    await storage.open();
    await storage.write({ key: "k1", data: "v1" });
    await storage.clear();

    // 実行
    await storage.open();

    // 検証
    expect(await storage.exists({ key: "k1" })).toBe(false);
  });

  test("close と open を複数回繰り返してもデータは失われない", async ({ expect, storage }) => {
    // 準備
    await storage.open();
    await storage.write({ key: "k1", data: "v1" });

    // 実行
    for (let i = 0; i < 3; i++) {
      await storage.close();
      await storage.open();
    }

    // 検証
    expect(await storage.read({ key: "k1" })).toBe("v1");
  });

  test("ストリームで書いたデータも再度 open した後で読み取れる", async ({ expect, storage }) => {
    // 準備
    await storage.open();
    const writer = storage.getWritable({ key: "s1" }).getWriter();
    await writer.write(new Uint8Array([1, 2]));
    await writer.write(new Uint8Array([3]));
    await writer.close();
    await storage.close();

    // 実行
    await storage.open();

    // 検証
    expect(await storage.read({ key: "s1" })).toStrictEqual(new Uint8Array([1, 2, 3]));
  });

  test("削除したデータは再度 open しても復活しない", async ({ expect, dbName, storage }) => {
    // 準備
    await storage.open();
    await storage.write({ key: "k1", data: "v1" });
    await storage.delete({ key: "k1" });
    await storage.close();

    // 実行
    const second = new IndexeddbStorage(dbName, STORE_NAME);
    await second.open();

    try {
      // 検証
      expect(await second.exists({ key: "k1" })).toBe(false);
    } finally {
      await second.close();
    }
  });
});
