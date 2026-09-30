import { describe } from "vitest";

import IndexeddbStorage from "../src/indexeddb.js";
import { STORE_NAME, captureRejection, createEmptyDatabase, test } from "./_helpers.js";

const openedOperations: readonly {
  readonly label: string;
  readonly run: (storage: IndexeddbStorage) => Promise<unknown>;
}[] = [
  { label: "write", run: (storage) => storage.write({ key: "k", data: "v" }) },
  { label: "read", run: (storage) => storage.read({ key: "k" }) },
  { label: "exists", run: (storage) => storage.exists({ key: "k" }) },
  { label: "delete", run: (storage) => storage.delete({ key: "k" }) },
  { label: "clear", run: (storage) => storage.clear() },
];

describe("存在しないキー", () => {
  test("read は NotFoundError の DOMException で拒否される", async ({ expect, storage }) => {
    // 準備
    await storage.open();

    // 実行
    const error = await captureRejection(storage.read({ key: "missing" }));

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("NotFoundError");
    expect((error as DOMException).message).toBe(
      "A requested file or directory could not be found at the time an operation was processed.",
    );
  });

  test("delete を呼んでもエラーにならない", async ({ expect, storage }) => {
    // 準備
    await storage.open();

    // 実行と検証
    await expect(storage.delete({ key: "missing" })).resolves.toBeUndefined();
  });

  test("exists は false を返す", async ({ expect, storage }) => {
    // 準備
    await storage.open();

    // 実行
    const exists = await storage.exists({ key: "missing" });

    // 検証
    expect(exists).toBe(false);
  });

  test("getReadable は読み取り時に NotFoundError の DOMException で拒否される", async ({
    expect,
    storage,
  }) => {
    // 準備
    await storage.open();
    const reader = storage.getReadable({ key: "missing" }).getReader();

    // 実行
    const error = await captureRejection(reader.read());

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("NotFoundError");
  });
});

describe("削除・消去後", () => {
  test("delete したキーの read は NotFoundError で拒否される", async ({ expect, storage }) => {
    // 準備
    await storage.open();
    await storage.write({ key: "k1", data: "v1" });
    await storage.delete({ key: "k1" });

    // 実行
    const error = await captureRejection(storage.read({ key: "k1" }));

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("NotFoundError");
  });

  test("clear したキーの read は NotFoundError で拒否される", async ({ expect, storage }) => {
    // 準備
    await storage.open();
    await storage.write({ key: "k1", data: "v1" });
    await storage.clear();

    // 実行
    const error = await captureRejection(storage.read({ key: "k1" }));

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("NotFoundError");
  });

  test("空の状態で clear を呼んでもエラーにならない", async ({ expect, storage }) => {
    // 準備
    await storage.open();

    // 実行と検証
    await expect(storage.clear()).resolves.toBeUndefined();
  });

  test("削除したキーへ再度書き込みできる", async ({ expect, storage }) => {
    // 準備
    await storage.open();
    await storage.write({ key: "k1", data: "v1" });
    await storage.delete({ key: "k1" });

    // 実行
    await storage.write({ key: "k1", data: "v2" });

    // 検証
    expect(await storage.read({ key: "k1" })).toBe("v2");
  });
});

describe("close した後", () => {
  test("isOpen は false である", async ({ expect, storage }) => {
    // 準備
    await storage.open();
    await storage.close();

    // 検証
    expect(storage.isOpen).toBe(false);
  });

  for (const { label, run } of openedOperations) {
    test(`close 後の ${label} は TypeError で拒否される`, async ({ expect, storage }) => {
      // 準備
      await storage.open();
      await storage.close();

      // 実行
      const error = await captureRejection(run(storage));

      // 検証
      expect(error).toBeInstanceOf(TypeError);
    });
  }

  test("close 後の getWritable はクローズ時に TypeError で拒否される", async ({
    expect,
    storage,
  }) => {
    // 準備
    await storage.open();
    await storage.close();
    const writer = storage.getWritable({ key: "k1" }).getWriter();

    // 実行
    const error = await captureRejection(writer.close());

    // 検証
    expect(error).toBeInstanceOf(TypeError);
  });
});

describe("ストアが存在しないとき", () => {
  test("write は NotFoundError の DOMException で拒否される", async ({ expect, dbName }) => {
    // 準備
    await createEmptyDatabase(dbName, 1);
    const storage = new IndexeddbStorage(dbName, "missing-store");
    await storage.open();

    try {
      // 実行
      const error = await captureRejection(storage.write({ key: "k1", data: "v1" }));

      // 検証
      expect(error).toBeInstanceOf(DOMException);
      expect((error as DOMException).name).toBe("NotFoundError");
    } finally {
      await storage.close();
    }
  });

  test("exists は NotFoundError の DOMException で拒否される", async ({ expect, dbName }) => {
    // 準備
    await createEmptyDatabase(dbName, 1);
    const storage = new IndexeddbStorage(dbName, "missing-store");
    await storage.open();

    try {
      // 実行
      const error = await captureRejection(storage.exists({ key: "k1" }));

      // 検証
      expect(error).toBeInstanceOf(DOMException);
      expect((error as DOMException).name).toBe("NotFoundError");
    } finally {
      await storage.close();
    }
  });

  test("clear は NotFoundError の DOMException で拒否される", async ({ expect, dbName }) => {
    // 準備
    await createEmptyDatabase(dbName, 1);
    const storage = new IndexeddbStorage(dbName, "missing-store");
    await storage.open();

    try {
      // 実行
      const error = await captureRejection(storage.clear());

      // 検証
      expect(error).toBeInstanceOf(DOMException);
      expect((error as DOMException).name).toBe("NotFoundError");
    } finally {
      await storage.close();
    }
  });
});

describe("open に失敗するとき", () => {
  test("より高いバージョンのデータベースが存在すると VersionError で拒否される", async ({
    expect,
    dbName,
  }) => {
    // 準備
    await createEmptyDatabase(dbName, 2);
    const storage = new IndexeddbStorage(dbName, STORE_NAME);

    // 実行
    const error = await captureRejection(storage.open());

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("VersionError");
    expect(storage.isOpen).toBe(false);
  });

  test("open に失敗した後、再度 open を呼ぶと再び拒否される", async ({ expect, dbName }) => {
    // 準備
    await createEmptyDatabase(dbName, 2);
    const storage = new IndexeddbStorage(dbName, STORE_NAME);

    // 実行
    await captureRejection(storage.open());
    const error = await captureRejection(storage.open());

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect(storage.isOpen).toBe(false);
  });
});
