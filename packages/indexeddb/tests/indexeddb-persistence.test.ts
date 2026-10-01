import { describe } from "vitest";

import IndexeddbStorage from "../src/indexeddb.js";
import { STORE_NAME, test } from "./_helpers.js";

const { signal } = new AbortController();

describe("永続化", () => {
  test("close して同じインスタンスで再度 open してもデータを読み取れる", async ({
    expect,
    storage,
  }) => {
    // 準備
    await storage.open({ signal });
    await storage.write({ key: "k1", data: { message: "hello" }, signal });
    await storage.close({ signal });

    // 実行
    await storage.open({ signal });

    // 検証
    expect(await storage.read({ key: "k1", signal })).toStrictEqual({ message: "hello" });
  });

  test("別インスタンスで同じ DB を開いてもデータを読み取れる", async ({
    expect,
    dbName,
    storage,
  }) => {
    // 準備
    await storage.open({ signal });
    await storage.write({ key: "k1", data: "v1", signal });
    await storage.close({ signal });

    // 実行
    const second = new IndexeddbStorage(dbName, STORE_NAME);
    await second.open({ signal });

    try {
      // 検証
      expect(await second.read({ key: "k1", signal })).toBe("v1");
    } finally {
      await second.close({ signal });
    }
  });

  test("clear して再度 open すると空の状態になっている", async ({ expect, storage }) => {
    // 準備
    await storage.open({ signal });
    await storage.write({ key: "k1", data: "v1", signal });
    await storage.clear({ signal });

    // 実行
    await storage.open({ signal });

    // 検証
    expect(await storage.exists({ key: "k1", signal })).toBe(false);
  });

  test("close と open を複数回繰り返してもデータは失われない", async ({ expect, storage }) => {
    // 準備
    await storage.open({ signal });
    await storage.write({ key: "k1", data: "v1", signal });

    // 実行
    for (let i = 0; i < 3; i++) {
      await storage.close({ signal });
      await storage.open({ signal });
    }

    // 検証
    expect(await storage.read({ key: "k1", signal })).toBe("v1");
  });

  test("ストリームで書いたデータも再度 open した後で読み取れる", async ({ expect, storage }) => {
    // 準備
    await storage.open({ signal });
    const writer = storage.getWritable({ key: "s1", signal }).getWriter();
    await writer.write(new Uint8Array([1, 2]));
    await writer.write(new Uint8Array([3]));
    await writer.close();
    await storage.close({ signal });

    // 実行
    await storage.open({ signal });

    // 検証
    expect(await storage.read({ key: "s1", signal })).toStrictEqual(new Uint8Array([1, 2, 3]));
  });

  test("削除したデータは再度 open しても復活しない", async ({ expect, dbName, storage }) => {
    // 準備
    await storage.open({ signal });
    await storage.write({ key: "k1", data: "v1", signal });
    await storage.delete({ key: "k1", signal });
    await storage.close({ signal });

    // 実行
    const second = new IndexeddbStorage(dbName, STORE_NAME);
    await second.open({ signal });

    try {
      // 検証
      expect(await second.exists({ key: "k1", signal })).toBe(false);
    } finally {
      await second.close({ signal });
    }
  });
});
