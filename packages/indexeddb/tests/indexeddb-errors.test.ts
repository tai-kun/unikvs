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
  createStreamContext,
} from "@unikvs/testing";
import { describe } from "vitest";

import IndexeddbStorage from "../src/indexeddb.js";
import { STORE_NAME, createEmptyDatabase, test } from "./_helpers.js";

const { signal } = new AbortController();

const openedOperations: readonly {
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

describe("存在しないキー", () => {
  test("read は NotFoundError の DOMException で拒否される", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行
    const error = await captureRejection(
      storage.read(createGetContext("missing", { signal }) as IStorage.ReadContext),
    );

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("NotFoundError");
    expect((error as DOMException).message).toBe(
      "A requested file or directory could not be found at the time an operation was processed.",
    );
  });

  test("delete を呼んでもエラーにならない", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行と検証
    await expect(
      storage.delete(createDeleteContext("missing", { signal }) as IStorage.DeleteContext),
    ).resolves.toBeUndefined();
  });

  test("exists は false を返す", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行
    const exists = await storage.exists(
      createHasContext("missing", { signal }) as IStorage.ExistsContext,
    );

    // 検証
    expect(exists).toBe(false);
  });

  test("getReadable は読み取り時に NotFoundError の DOMException で拒否される", async ({
    expect,
    storage,
  }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const reader = storage
      .getReadable(createStreamContext("missing", { signal }) as IStorage.GetReadableContext)
      .getReader();

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
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");
    await storage.delete(createDeleteContext("k1", { signal }) as IStorage.DeleteContext);

    // 実行
    const error = await captureRejection(
      storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext),
    );

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("NotFoundError");
  });

  test("clear したキーの read は NotFoundError で拒否される", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");
    await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

    // 実行
    const error = await captureRejection(
      storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext),
    );

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("NotFoundError");
  });

  test("空の状態で clear を呼んでもエラーにならない", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行と検証
    await expect(
      storage.clear(createClearContext("", { signal }) as IStorage.ClearContext),
    ).resolves.toBeUndefined();
  });

  test("削除したキーへ再度書き込みできる", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");
    await storage.delete(createDeleteContext("k1", { signal }) as IStorage.DeleteContext);

    // 実行
    await storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v2");

    // 検証
    expect(await storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toBe(
      "v2",
    );
  });
});

describe("close した後", () => {
  test("isOpen は false である", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.close(createCloseContext({ signal }) as IStorage.CloseContext);

    // 検証
    expect(storage.isOpen).toBe(false);
  });

  for (const { label, run } of openedOperations) {
    test(`close 後の ${label} は TypeError で拒否される`, async ({ expect, storage }) => {
      // 準備
      await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
      await storage.close(createCloseContext({ signal }) as IStorage.CloseContext);

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
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.close(createCloseContext({ signal }) as IStorage.CloseContext);
    const writer = storage
      .getWritable(createSetContext("k1", { signal }) as IStorage.GetWritableContext)
      .getWriter();

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
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    try {
      // 実行
      const error = await captureRejection(
        storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1"),
      );

      // 検証
      expect(error).toBeInstanceOf(DOMException);
      expect((error as DOMException).name).toBe("NotFoundError");
    } finally {
      await storage.close(createCloseContext({ signal }) as IStorage.CloseContext);
    }
  });

  test("exists は NotFoundError の DOMException で拒否される", async ({ expect, dbName }) => {
    // 準備
    await createEmptyDatabase(dbName, 1);
    const storage = new IndexeddbStorage(dbName, "missing-store");
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    try {
      // 実行
      const error = await captureRejection(
        storage.exists(createHasContext("k1", { signal }) as IStorage.ExistsContext),
      );

      // 検証
      expect(error).toBeInstanceOf(DOMException);
      expect((error as DOMException).name).toBe("NotFoundError");
    } finally {
      await storage.close(createCloseContext({ signal }) as IStorage.CloseContext);
    }
  });

  test("clear は NotFoundError の DOMException で拒否される", async ({ expect, dbName }) => {
    // 準備
    await createEmptyDatabase(dbName, 1);
    const storage = new IndexeddbStorage(dbName, "missing-store");
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    try {
      // 実行
      const error = await captureRejection(
        storage.clear(createClearContext("", { signal }) as IStorage.ClearContext),
      );

      // 検証
      expect(error).toBeInstanceOf(DOMException);
      expect((error as DOMException).name).toBe("NotFoundError");
    } finally {
      await storage.close(createCloseContext({ signal }) as IStorage.CloseContext);
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
    const error = await captureRejection(
      storage.open(createOpenContext({ signal }) as IStorage.OpenContext),
    );

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
    await captureRejection(storage.open(createOpenContext({ signal }) as IStorage.OpenContext));
    const error = await captureRejection(
      storage.open(createOpenContext({ signal }) as IStorage.OpenContext),
    );

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect(storage.isOpen).toBe(false);
  });
});
