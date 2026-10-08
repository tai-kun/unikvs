import { describe } from "vitest";

import IndexeddbStorage from "../src/indexeddb.js";
import { STORE_NAME, captureRejection, deleteDatabase, test } from "./_helpers.js";

const { signal } = new AbortController();

const DEFAULT_DB_NAME = "unikvs_db";

const unopenedOperations: readonly {
  readonly label: string;
  readonly run: (storage: IndexeddbStorage) => Promise<unknown>;
}[] = [
  { label: "write", run: (storage) => storage.write({ key: "k", data: "v", signal, vars: {} }) },
  { label: "read", run: (storage) => storage.read({ key: "k", signal }) },
  { label: "exists", run: (storage) => storage.exists({ key: "k", signal }) },
  { label: "delete", run: (storage) => storage.delete({ key: "k", signal }) },
  { label: "clear", run: (storage) => storage.clear({ signal }) },
];

describe("ライフサイクル", () => {
  test("open した後に close して再度 open すると、再びオープン状態になる", async ({
    expect,
    storage,
  }) => {
    // 準備
    await storage.open({ signal });
    await storage.close({ signal });

    // 実行
    await storage.open({ signal });

    // 検証
    expect(storage.isOpen).toBe(true);
  });

  test("close して再度 open した後も、引き続きデータを操作できる", async ({ expect, storage }) => {
    // 準備
    await storage.open({ signal });
    await storage.close({ signal });

    // 実行
    await storage.open({ signal });
    await storage.write({ key: "k1", data: "v1", signal, vars: {} });

    // 検証
    expect(await storage.read({ key: "k1", signal })).toBe("v1");
  });

  test("open する前に close を呼ぶと TypeError で拒否される", async ({ expect, storage }) => {
    // 実行
    const error = await captureRejection(storage.close({ signal }));

    // 検証
    expect(error).toBeInstanceOf(TypeError);
    expect(storage.isOpen).toBe(false);
  });

  test("open を並行に複数回呼び出しても接続できる", async ({ expect, storage }) => {
    // 実行
    await Promise.all([storage.open({ signal }), storage.open({ signal })]);

    // 検証
    expect(storage.isOpen).toBe(true);
  });

  test("open を並行に呼び出した後もデータを操作できる", async ({ expect, storage }) => {
    // 準備
    await Promise.all([storage.open({ signal }), storage.open({ signal })]);

    // 実行
    await storage.write({ key: "k1", data: "v1", signal, vars: {} });

    // 検証
    expect(await storage.read({ key: "k1", signal })).toBe("v1");
  });

  test("既定の DB 名とストア名でデータを保存できる", async ({ expect }) => {
    // 準備
    const storage = new IndexeddbStorage();

    try {
      // 実行
      await storage.open({ signal });
      await storage.write({ key: "k1", data: "v1", signal, vars: {} });

      // 検証
      expect(await storage.read({ key: "k1", signal })).toBe("v1");
    } finally {
      if (storage.isOpen) {
        await storage.close({ signal });
      }
      await deleteDatabase(DEFAULT_DB_NAME);
    }
  });

  test("カスタムの DB 名とストア名でデータを保存できる", async ({ expect, dbName }) => {
    // 準備
    const storage = new IndexeddbStorage(dbName, STORE_NAME);

    try {
      // 実行
      await storage.open({ signal });
      await storage.write({ key: "k1", data: "v1", signal, vars: {} });

      // 検証
      expect(await storage.read({ key: "k1", signal })).toBe("v1");
    } finally {
      if (storage.isOpen) {
        await storage.close({ signal });
      }
    }
  });

  test("同じ DB 名の複数インスタンスでデータを共有できる", async ({ expect, dbName, storage }) => {
    // 準備
    const second = new IndexeddbStorage(dbName, STORE_NAME);
    await storage.open({ signal });
    await second.open({ signal });

    try {
      // 実行
      await storage.write({ key: "k1", data: "v1", signal, vars: {} });

      // 検証
      expect(await second.read({ key: "k1", signal })).toBe("v1");
    } finally {
      await second.close({ signal });
    }
  });

  test("異なる DB 名のインスタンス間ではデータを共有しない", async ({
    expect,
    dbName,
    storage,
  }) => {
    // 準備
    const other = new IndexeddbStorage(`other-${dbName}`, STORE_NAME);
    await storage.open({ signal });
    await other.open({ signal });

    try {
      // 実行
      await storage.write({ key: "k1", data: "v1", signal, vars: {} });

      // 検証
      expect(await other.exists({ key: "k1", signal })).toBe(false);
    } finally {
      await other.close({ signal });
      await deleteDatabase(`other-${dbName}`);
    }
  });

  test("close 後は isOpen が false のままである", async ({ expect, storage }) => {
    // 準備
    await storage.open({ signal });
    await storage.close({ signal });

    // 検証
    expect(storage.isOpen).toBe(false);
  });
});

describe("open していないとき", () => {
  for (const { label, run } of unopenedOperations) {
    test(`${label} は TypeError で拒否される`, async ({ expect, storage }) => {
      // 実行
      const error = await captureRejection(run(storage));

      // 検証
      expect(error).toBeInstanceOf(TypeError);
    });
  }
});
