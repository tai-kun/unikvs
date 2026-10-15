import type { IStorage } from "@unikvs/core";
import {
  captureRejection,
  createClearContext,
  createCloseContext,
  createDeleteContext,
  createGetContext,
  createHasContext,
  createOpenContext,
  createSetContext,
} from "@unikvs/testing";
import { describe } from "vitest";

import IndexeddbStorage from "../src/indexeddb.js";
import { STORE_NAME, deleteDatabase, test } from "./_helpers.js";

const { signal } = new AbortController();

const DEFAULT_DB_NAME = "unikvs_db";

const unopenedOperations: readonly {
  readonly label: string;
  readonly run: (storage: IndexeddbStorage) => Promise<unknown>;
}[] = [
  {
    label: "write",
    run: (storage) =>
      storage.write(createSetContext("k", { signal }) as IStorage.WriteContext, "v"),
  },
  {
    label: "read",
    run: (storage) => storage.read(createGetContext("k", { signal }) as IStorage.ReadContext),
  },
  {
    label: "exists",
    run: (storage) => storage.exists(createHasContext("k", { signal }) as IStorage.ExistsContext),
  },
  {
    label: "delete",
    run: (storage) =>
      storage.delete(createDeleteContext("k", { signal }) as IStorage.DeleteContext),
  },
  {
    label: "clear",
    run: (storage) => storage.clear(createClearContext("", { signal }) as IStorage.ClearContext),
  },
];

describe("ライフサイクル", () => {
  test("open した後に close して再度 open すると、再びオープン状態になる", async ({
    expect,
    storage,
  }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.close(createCloseContext({ signal }) as IStorage.CloseContext);

    // 実行
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 検証
    expect(storage.isOpen).toBe(true);
  });

  test("close して再度 open した後も、引き続きデータを操作できる", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.close(createCloseContext({ signal }) as IStorage.CloseContext);

    // 実行
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");

    // 検証
    expect(await storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toBe(
      "v1",
    );
  });

  test("open する前に close を呼ぶと TypeError で拒否される", async ({ expect, storage }) => {
    // 実行
    const error = await captureRejection(
      storage.close(createCloseContext({ signal }) as IStorage.CloseContext),
    );

    // 検証
    expect(error).toBeInstanceOf(TypeError);
    expect(storage.isOpen).toBe(false);
  });

  test("open を並行に複数回呼び出しても接続できる", async ({ expect, storage }) => {
    // 実行
    await Promise.all([
      storage.open(createOpenContext({ signal }) as IStorage.OpenContext),
      storage.open(createOpenContext({ signal }) as IStorage.OpenContext),
    ]);

    // 検証
    expect(storage.isOpen).toBe(true);
  });

  test("open を並行に呼び出した後もデータを操作できる", async ({ expect, storage }) => {
    // 準備
    await Promise.all([
      storage.open(createOpenContext({ signal }) as IStorage.OpenContext),
      storage.open(createOpenContext({ signal }) as IStorage.OpenContext),
    ]);

    // 実行
    await storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");

    // 検証
    expect(await storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toBe(
      "v1",
    );
  });

  test("既定の DB 名とストア名でデータを保存できる", async ({ expect }) => {
    // 準備
    const storage = new IndexeddbStorage();

    try {
      // 実行
      await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
      await storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");

      // 検証
      expect(await storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toBe(
        "v1",
      );
    } finally {
      if (storage.isOpen) {
        await storage.close(createCloseContext({ signal }) as IStorage.CloseContext);
      }
      await deleteDatabase(DEFAULT_DB_NAME);
    }
  });

  test("カスタムの DB 名とストア名でデータを保存できる", async ({ expect, dbName }) => {
    // 準備
    const storage = new IndexeddbStorage(dbName, STORE_NAME);

    try {
      // 実行
      await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
      await storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");

      // 検証
      expect(await storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toBe(
        "v1",
      );
    } finally {
      if (storage.isOpen) {
        await storage.close(createCloseContext({ signal }) as IStorage.CloseContext);
      }
    }
  });

  test("同じ DB 名の複数インスタンスでデータを共有できる", async ({ expect, dbName, storage }) => {
    // 準備
    const second = new IndexeddbStorage(dbName, STORE_NAME);
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await second.open(createOpenContext({ signal }) as IStorage.OpenContext);

    try {
      // 実行
      await storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");

      // 検証
      expect(await second.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toBe(
        "v1",
      );
    } finally {
      await second.close(createCloseContext({ signal }) as IStorage.CloseContext);
    }
  });

  test("異なる DB 名のインスタンス間ではデータを共有しない", async ({
    expect,
    dbName,
    storage,
  }) => {
    // 準備
    const other = new IndexeddbStorage(`other-${dbName}`, STORE_NAME);
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await other.open(createOpenContext({ signal }) as IStorage.OpenContext);

    try {
      // 実行
      await storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");

      // 検証
      expect(await other.exists(createHasContext("k1", { signal }) as IStorage.ExistsContext)).toBe(
        false,
      );
    } finally {
      await other.close(createCloseContext({ signal }) as IStorage.CloseContext);
      await deleteDatabase(`other-${dbName}`);
    }
  });

  test("close 後は isOpen が false のままである", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.close(createCloseContext({ signal }) as IStorage.CloseContext);

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
