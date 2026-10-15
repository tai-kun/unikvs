import type { IStorage } from "@unikvs/core";
import {
  collectBytes,
  createClearContext,
  createDeleteContext,
  createGetContext,
  createHasContext,
  createSetContext,
  createStreamContext,
} from "@unikvs/testing";
import { describe } from "vitest";

import { test } from "./_helpers.js";

describe("基本操作 (CRUD)", () => {
  test("データを読み込んだとき、書き込まれたデータが Uint8Array として正しく返される", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "read-test.bin";
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

    // 実行
    const result = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);

    // 検証
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result).toStrictEqual(data);
  });

  test("存在するキーで確認したとき、true が返される", async ({ expect, signal, storage }) => {
    // 準備
    const key = "exists.txt";
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([0]),
    );

    // 実行
    const result = await storage.exists(
      createHasContext(key, { signal }) as IStorage.ExistsContext,
    );

    // 検証
    expect(result).toBe(true);
  });

  test("存在しないキーで確認したとき、false が返される", async ({ expect, signal, storage }) => {
    // 準備
    const key = "non-existent.txt";

    // 実行
    const result = await storage.exists(
      createHasContext(key, { signal }) as IStorage.ExistsContext,
    );

    // 検証
    expect(result).toBe(false);
  });

  test("キーを削除したとき、存在確認が false になる", async ({ expect, signal, storage }) => {
    // 準備
    const key = "delete-me.txt";
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([0]),
    );

    // 実行
    await storage.delete(createDeleteContext(key, { signal }) as IStorage.DeleteContext);

    // 検証
    await expect(
      storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext),
    ).resolves.toBe(false);
  });

  test("clear を実行したとき、バケット内の全データが削除される", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    await storage.write(
      createSetContext("file1.txt", { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await storage.write(
      createSetContext("file2.txt", { signal }) as IStorage.WriteContext,
      new Uint8Array([2]),
    );

    // 実行
    await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

    // 検証
    await expect(
      storage.exists(createHasContext("file1.txt", { signal }) as IStorage.ExistsContext),
    ).resolves.toBe(false);
    await expect(
      storage.exists(createHasContext("file2.txt", { signal }) as IStorage.ExistsContext),
    ).resolves.toBe(false);
  });

  test("clear を実行した後も同じバケットへ書き込める", async ({ expect, signal, storage }) => {
    // 準備
    await storage.write(
      createSetContext("before-clear.txt", { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

    // 実行
    await storage.write(
      createSetContext("after-clear.txt", { signal }) as IStorage.WriteContext,
      new Uint8Array([2]),
    );

    // 検証
    await expect(
      storage.exists(createHasContext("before-clear.txt", { signal }) as IStorage.ExistsContext),
    ).resolves.toBe(false);
    await expect(
      storage.read(createGetContext("after-clear.txt", { signal }) as IStorage.ReadContext),
    ).resolves.toStrictEqual(new Uint8Array([2]));
  });
});

describe("ストリーム操作", () => {
  test("getWritable で取得したストリームを使用したとき、データが正しく書き込める", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "stream-write.txt";
    const data = new TextEncoder().encode("Stream Data");
    const writable = storage.getWritable(
      createSetContext(key, { signal }) as IStorage.GetWritableContext,
    );

    // 実行
    const writer = writable.getWriter();
    await writer.write(data);
    await writer.close();

    // 検証
    await expect(
      storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).resolves.toStrictEqual(data);
  });

  test("getReadable で取得したストリームを使用したとき、データの内容を正しく読み取れる", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "stream-read.txt";
    const data = new TextEncoder().encode("Readable Stream Content");
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

    // 実行
    const result = await collectBytes(
      storage.getReadable(createStreamContext(key, { signal }) as IStorage.GetReadableContext),
    );

    // 検証
    expect(result).toStrictEqual(data);
  });
});
