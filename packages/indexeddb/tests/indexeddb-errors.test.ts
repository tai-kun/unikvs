import type { IStorage } from "@unikvs/core";
import {
  captureRejection,
  createGetContext,
  createHasContext,
  createSetContext,
  createOpenContext,
  createClearContext,
  createCloseContext,
  createDeleteContext,
  createStreamContext,
} from "@unikvs/testing";
import { describe } from "vite-plus/test";

import { InvalidChunkTypeError } from "../src/errors.js";
import IndexeddbStorage from "../src/indexeddb.js";
import { test, STORE_NAME, createEmptyDatabase } from "./_helpers.js";

const { signal } = new AbortController();

const openedOperations: readonly {
  readonly run: (storage: IndexeddbStorage) => Promise<unknown>;
  readonly label: string;
}[] = [
  {
    run: (storage) =>
      storage.write(createSetContext("k", { signal }) as IStorage.WriteContext, "v"),
    label: "write",
  },
  {
    run: (storage) => storage.read(createGetContext("k", { signal }) as IStorage.ReadContext),
    label: "read",
  },
  {
    run: (storage) => storage.exists(createHasContext("k", { signal }) as IStorage.ExistsContext),
    label: "exists",
  },
  {
    run: (storage) =>
      storage.delete(createDeleteContext("k", { signal }) as IStorage.DeleteContext),
    label: "delete",
  },
  {
    run: (storage) => storage.clear(createClearContext("", { signal }) as IStorage.ClearContext),
    label: "clear",
  },
];
describe("存在しないキー", () => {
  test("read は NotFoundError の DOMException で拒否される", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行：
    const error = await captureRejection(
      storage.read(createGetContext("missing", { signal }) as IStorage.ReadContext),
    );

    // 検証：
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("NotFoundError");
    expect((error as DOMException).message).toBe(
      "A requested file or directory could not be found at the time an operation was processed.",
    );
  });

  test("delete を呼んでもエラーにならない", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行と検証：
    await expect(
      storage.delete(createDeleteContext("missing", { signal }) as IStorage.DeleteContext),
    ).resolves.toBeUndefined();
  });

  test("exists は false を返す", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行：
    const exists = await storage.exists(
      createHasContext("missing", { signal }) as IStorage.ExistsContext,
    );

    // 検証：
    expect(exists).toBe(false);
  });

  test("getReadable は読み取り時に NotFoundError の DOMException で拒否される", async ({
    expect,
    storage,
  }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const reader = storage
      .getReadable(createStreamContext("missing", { signal }) as IStorage.GetReadableContext)
      .getReader();

    // 実行：
    const error = await captureRejection(reader.read());

    // 検証：
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("NotFoundError");
  });
});
describe("削除・消去後", () => {
  test("delete したキーの read は NotFoundError で拒否される", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");
    await storage.delete(createDeleteContext("k1", { signal }) as IStorage.DeleteContext);

    // 実行：
    const error = await captureRejection(
      storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext),
    );

    // 検証：
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("NotFoundError");
  });

  test("clear したキーの read は NotFoundError で拒否される", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");
    await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

    // 実行：
    const error = await captureRejection(
      storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext),
    );

    // 検証：
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("NotFoundError");
  });

  test("空の状態で clear を呼んでもエラーにならない", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行と検証：
    await expect(
      storage.clear(createClearContext("", { signal }) as IStorage.ClearContext),
    ).resolves.toBeUndefined();
  });

  test("削除したキーへ再度書き込みできる", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");
    await storage.delete(createDeleteContext("k1", { signal }) as IStorage.DeleteContext);

    // 実行：
    await storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v2");

    // 検証：
    expect(await storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toBe(
      "v2",
    );
  });
});
describe("close した後", () => {
  test("isOpen は false である", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.close(createCloseContext({ signal }) as IStorage.CloseContext);

    // 検証：
    expect(storage.isOpen).toBe(false);
  });

  for (const { run, label } of openedOperations) {
    test(`close 後の ${label} は TypeError で拒否される`, async ({ expect, storage }) => {
      // 準備：
      await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
      await storage.close(createCloseContext({ signal }) as IStorage.CloseContext);

      // 実行：
      const error = await captureRejection(run(storage));

      // 検証：
      expect(error).toBeInstanceOf(TypeError);
    });
  }

  test("close 後の getWritable はクローズ時に TypeError で拒否される", async ({
    expect,
    storage,
  }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.close(createCloseContext({ signal }) as IStorage.CloseContext);
    const writer = storage
      .getWritable(createSetContext("k1", { signal }) as IStorage.GetWritableContext)
      .getWriter();

    // 実行：
    const error = await captureRejection(writer.close());

    // 検証：
    expect(error).toBeInstanceOf(TypeError);
  });
});
describe("ストアが存在しないとき", () => {
  test("write は NotFoundError の DOMException で拒否される", async ({ dbName, expect }) => {
    // 準備：
    await createEmptyDatabase(dbName, 1);
    const storage = new IndexeddbStorage(dbName, "missing-store");
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    try {
      // 実行：
      const error = await captureRejection(
        storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1"),
      );

      // 検証：
      expect(error).toBeInstanceOf(DOMException);
      expect((error as DOMException).name).toBe("NotFoundError");
    } finally {
      await storage.close(createCloseContext({ signal }) as IStorage.CloseContext);
    }
  });

  test("exists は NotFoundError の DOMException で拒否される", async ({ dbName, expect }) => {
    // 準備：
    await createEmptyDatabase(dbName, 1);
    const storage = new IndexeddbStorage(dbName, "missing-store");
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    try {
      // 実行：
      const error = await captureRejection(
        storage.exists(createHasContext("k1", { signal }) as IStorage.ExistsContext),
      );

      // 検証：
      expect(error).toBeInstanceOf(DOMException);
      expect((error as DOMException).name).toBe("NotFoundError");
    } finally {
      await storage.close(createCloseContext({ signal }) as IStorage.CloseContext);
    }
  });

  test("clear は NotFoundError の DOMException で拒否される", async ({ dbName, expect }) => {
    // 準備：
    await createEmptyDatabase(dbName, 1);
    const storage = new IndexeddbStorage(dbName, "missing-store");
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    try {
      // 実行：
      const error = await captureRejection(
        storage.clear(createClearContext("", { signal }) as IStorage.ClearContext),
      );

      // 検証：
      expect(error).toBeInstanceOf(DOMException);
      expect((error as DOMException).name).toBe("NotFoundError");
    } finally {
      await storage.close(createCloseContext({ signal }) as IStorage.CloseContext);
    }
  });
});
describe("InvalidChunkTypeError", () => {
  test("name は IndexeddbInvalidChunkTypeError である", ({ expect }) => {
    // 実行と検証：
    expect(
      new InvalidChunkTypeError({
        key: "k1",
        chunk: "x",
      }).name,
    ).toBe("IndexeddbInvalidChunkTypeError");
  });

  test("Error と InvalidChunkTypeError を継承している", ({ expect }) => {
    // 実行：
    const error = new InvalidChunkTypeError({
      key: "k1",
      chunk: "x",
    });

    // 検証：
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(InvalidChunkTypeError);
  });

  test("渡されたチャンクと型名を meta に保持する", ({ expect }) => {
    // 準備：
    const chunk = { invalid: true };

    // 実行：
    const error = new InvalidChunkTypeError({
      key: "k1",
      chunk,
    });

    // 検証：
    expect(error.meta.key).toBe("k1");
    expect(error.meta.chunk).toBe(chunk);
    expect(error.meta.chunkType).toBe("Object");
  });

  test("既定の英語メッセージを返す", ({ expect }) => {
    // 実行と検証：
    expect(
      new InvalidChunkTypeError({
        key: "k1",
        chunk: "x",
      }).message,
    ).toBe('Expected chunk for key "k1" is Uint8Array, but got string');
  });

  test("書き込み時に投げられたエラーはキーとチャンクを保持する", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const writer = storage
      .getWritable(createSetContext("s1", { signal }) as IStorage.GetWritableContext)
      .getWriter();

    // 実行：
    const error = await captureRejection(writer.write("invalid" as unknown as Uint8Array));

    // 検証：
    expect(error).toBeInstanceOf(InvalidChunkTypeError);
    expect((error as InvalidChunkTypeError).meta).toStrictEqual({
      key: "s1",
      chunk: "invalid",
      chunkType: "string",
    });
  });
});
describe("open に失敗するとき", () => {
  test("より高いバージョンのデータベースが存在すると VersionError で拒否される", async ({
    dbName,
    expect,
  }) => {
    // 準備：
    await createEmptyDatabase(dbName, 2);
    const storage = new IndexeddbStorage(dbName, STORE_NAME);

    // 実行：
    const error = await captureRejection(
      storage.open(createOpenContext({ signal }) as IStorage.OpenContext),
    );

    // 検証：
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("VersionError");
    expect(storage.isOpen).toBe(false);
  });

  test("open に失敗した後、再度 open を呼ぶと再び拒否される", async ({ dbName, expect }) => {
    // 準備：
    await createEmptyDatabase(dbName, 2);
    const storage = new IndexeddbStorage(dbName, STORE_NAME);

    // 実行：
    await captureRejection(storage.open(createOpenContext({ signal }) as IStorage.OpenContext));

    const error = await captureRejection(
      storage.open(createOpenContext({ signal }) as IStorage.OpenContext),
    );

    // 検証：
    expect(error).toBeInstanceOf(DOMException);

    expect(storage.isOpen).toBe(false);
  });
});
