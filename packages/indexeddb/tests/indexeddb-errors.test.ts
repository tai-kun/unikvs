import { describe } from "vitest";

import IndexeddbStorage from "../src/indexeddb.js";
import { STORE_NAME, captureRejection, createEmptyDatabase, test } from "./_helpers.js";

const { signal } = new AbortController();

const openedOperations: readonly {
  readonly label: string;
  readonly run: (storage: IndexeddbStorage) => Promise<unknown>;
}[] = [
  { label: "write", run: (storage) => storage.write({ key: "k", data: "v", signal, vars: {} }) },
  { label: "read", run: (storage) => storage.read({ key: "k", signal }) },
  { label: "exists", run: (storage) => storage.exists({ key: "k", signal }) },
  { label: "delete", run: (storage) => storage.delete({ key: "k", signal }) },
  { label: "clear", run: (storage) => storage.clear({ signal }) },
];

describe("存在しないキー", () => {
  test("read は NotFoundError の DOMException で拒否される", async ({ expect, storage }) => {
    // 準備
    await storage.open({ signal });

    // 実行
    const error = await captureRejection(storage.read({ key: "missing", signal }));

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("NotFoundError");
    expect((error as DOMException).message).toBe(
      "A requested file or directory could not be found at the time an operation was processed.",
    );
  });

  test("delete を呼んでもエラーにならない", async ({ expect, storage }) => {
    // 準備
    await storage.open({ signal });

    // 実行と検証
    await expect(storage.delete({ key: "missing", signal })).resolves.toBeUndefined();
  });

  test("exists は false を返す", async ({ expect, storage }) => {
    // 準備
    await storage.open({ signal });

    // 実行
    const exists = await storage.exists({ key: "missing", signal });

    // 検証
    expect(exists).toBe(false);
  });

  test("getReadable は読み取り時に NotFoundError の DOMException で拒否される", async ({
    expect,
    storage,
  }) => {
    // 準備
    await storage.open({ signal });
    const reader = storage.getReadable({ key: "missing", signal }).getReader();

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
    await storage.open({ signal });
    await storage.write({ key: "k1", data: "v1", signal, vars: {} });
    await storage.delete({ key: "k1", signal });

    // 実行
    const error = await captureRejection(storage.read({ key: "k1", signal }));

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("NotFoundError");
  });

  test("clear したキーの read は NotFoundError で拒否される", async ({ expect, storage }) => {
    // 準備
    await storage.open({ signal });
    await storage.write({ key: "k1", data: "v1", signal, vars: {} });
    await storage.clear({ signal });

    // 実行
    const error = await captureRejection(storage.read({ key: "k1", signal }));

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("NotFoundError");
  });

  test("空の状態で clear を呼んでもエラーにならない", async ({ expect, storage }) => {
    // 準備
    await storage.open({ signal });

    // 実行と検証
    await expect(storage.clear({ signal })).resolves.toBeUndefined();
  });

  test("削除したキーへ再度書き込みできる", async ({ expect, storage }) => {
    // 準備
    await storage.open({ signal });
    await storage.write({ key: "k1", data: "v1", signal, vars: {} });
    await storage.delete({ key: "k1", signal });

    // 実行
    await storage.write({ key: "k1", data: "v2", signal, vars: {} });

    // 検証
    expect(await storage.read({ key: "k1", signal })).toBe("v2");
  });
});

describe("close した後", () => {
  test("isOpen は false である", async ({ expect, storage }) => {
    // 準備
    await storage.open({ signal });
    await storage.close({ signal });

    // 検証
    expect(storage.isOpen).toBe(false);
  });

  for (const { label, run } of openedOperations) {
    test(`close 後の ${label} は TypeError で拒否される`, async ({ expect, storage }) => {
      // 準備
      await storage.open({ signal });
      await storage.close({ signal });

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
    await storage.open({ signal });
    await storage.close({ signal });
    const writer = storage.getWritable({ key: "k1", signal, vars: {} }).getWriter();

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
    await storage.open({ signal });

    try {
      // 実行
      const error = await captureRejection(
        storage.write({ key: "k1", data: "v1", signal, vars: {} }),
      );

      // 検証
      expect(error).toBeInstanceOf(DOMException);
      expect((error as DOMException).name).toBe("NotFoundError");
    } finally {
      await storage.close({ signal });
    }
  });

  test("exists は NotFoundError の DOMException で拒否される", async ({ expect, dbName }) => {
    // 準備
    await createEmptyDatabase(dbName, 1);
    const storage = new IndexeddbStorage(dbName, "missing-store");
    await storage.open({ signal });

    try {
      // 実行
      const error = await captureRejection(storage.exists({ key: "k1", signal }));

      // 検証
      expect(error).toBeInstanceOf(DOMException);
      expect((error as DOMException).name).toBe("NotFoundError");
    } finally {
      await storage.close({ signal });
    }
  });

  test("clear は NotFoundError の DOMException で拒否される", async ({ expect, dbName }) => {
    // 準備
    await createEmptyDatabase(dbName, 1);
    const storage = new IndexeddbStorage(dbName, "missing-store");
    await storage.open({ signal });

    try {
      // 実行
      const error = await captureRejection(storage.clear({ signal }));

      // 検証
      expect(error).toBeInstanceOf(DOMException);
      expect((error as DOMException).name).toBe("NotFoundError");
    } finally {
      await storage.close({ signal });
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
    const error = await captureRejection(storage.open({ signal }));

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
    await captureRejection(storage.open({ signal }));
    const error = await captureRejection(storage.open({ signal }));

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect(storage.isOpen).toBe(false);
  });
});
