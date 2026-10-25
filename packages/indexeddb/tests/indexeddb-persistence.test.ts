import type { IStorage } from "@unikvs/core";
import {
  createGetContext,
  createHasContext,
  createSetContext,
  createOpenContext,
  createClearContext,
  createCloseContext,
  createDeleteContext,
} from "@unikvs/testing";
import { describe } from "vite-plus/test";

import IndexeddbStorage from "../src/indexeddb.js";
import { test, STORE_NAME } from "./_helpers.js";

const { signal } = new AbortController();
describe("永続化", () => {
  test("close して同じインスタンスで再度 open してもデータを読み取れる", async ({
    expect,
    storage,
  }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, {
      message: "hello",
    });
    await storage.close(createCloseContext({ signal }) as IStorage.CloseContext);

    // 実行：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 検証：
    expect(
      await storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext),
    ).toStrictEqual({ message: "hello" });
  });

  test("別インスタンスで同じ DB を開いてもデータを読み取れる", async ({
    dbName,
    expect,
    storage,
  }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");
    await storage.close(createCloseContext({ signal }) as IStorage.CloseContext);

    // 実行：
    const second = new IndexeddbStorage(dbName, STORE_NAME);
    await second.open(createOpenContext({ signal }) as IStorage.OpenContext);

    try {
      // 検証：
      expect(await second.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toBe(
        "v1",
      );
    } finally {
      await second.close(createCloseContext({ signal }) as IStorage.CloseContext);
    }
  });

  test("clear して再度 open すると空の状態になっている", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");
    await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

    // 実行：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 検証：
    expect(await storage.exists(createHasContext("k1", { signal }) as IStorage.ExistsContext)).toBe(
      false,
    );
  });

  test("close と open を複数回繰り返してもデータは失われない", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");

    // 実行：
    for (let i = 0; i < 3; i++) {
      await storage.close(createCloseContext({ signal }) as IStorage.CloseContext);
      await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    }

    // 検証：
    expect(await storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext)).toBe(
      "v1",
    );
  });

  test("ストリームで書いたデータも再度 open した後で読み取れる", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const writer = storage
      .getWritable(createSetContext("s1", { signal }) as IStorage.GetWritableContext)
      .getWriter();
    await writer.write(new Uint8Array([1, 2]));
    await writer.write(new Uint8Array([3]));
    await writer.close();

    await storage.close(createCloseContext({ signal }) as IStorage.CloseContext);

    // 実行：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 検証：
    expect(
      await storage.read(createGetContext("s1", { signal }) as IStorage.ReadContext),
    ).toStrictEqual(new Uint8Array([1, 2, 3]));
  });

  test("削除したデータは再度 open しても復活しない", async ({ dbName, expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");
    await storage.delete(createDeleteContext("k1", { signal }) as IStorage.DeleteContext);
    await storage.close(createCloseContext({ signal }) as IStorage.CloseContext);

    // 実行：
    const second = new IndexeddbStorage(dbName, STORE_NAME);
    await second.open(createOpenContext({ signal }) as IStorage.OpenContext);

    try {
      // 検証：
      expect(
        await second.exists(createHasContext("k1", { signal }) as IStorage.ExistsContext),
      ).toBe(false);
    } finally {
      await second.close(createCloseContext({ signal }) as IStorage.CloseContext);
    }
  });
});
