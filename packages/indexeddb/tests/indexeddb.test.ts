import type { IStorage } from "@unikvs/core";
import {
  createClearContext,
  createCloseContext,
  createDeleteContext,
  createGetContext,
  createHasContext,
  createOpenContext,
  createSetContext,
  createStreamContext,
} from "@unikvs/testing";
import { describe, test, beforeEach, afterEach } from "vitest";

import IndexeddbStorage from "../src/indexeddb.js";

const { signal } = new AbortController();

let storage: IndexeddbStorage;
const DB_NAME = "TestDB";
const STORE_NAME = "TestStore";

beforeEach(async () => {
  storage = new IndexeddbStorage(DB_NAME, STORE_NAME);
  // テストごとにクリーンな状態を保証するため、データベースを削除または初期化する。
  const indexedDB = globalThis.indexedDB;
  if (indexedDB) {
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  }
});

afterEach(async () => {
  if (storage.isOpen) {
    await storage.close(createCloseContext({ signal }) as IStorage.CloseContext);
  }
});

describe("ライフサイクル管理", () => {
  test("インスタンス化したとき、初期状態はクローズ状態である", ({ expect }) => {
    // 準備 & Act は beforeEach とコンストラクタで行われている。

    // 検証
    expect(storage.name).toBe("Indexeddb");
    expect(storage.isOpen).toBe(false);
  });

  test("open を実行したとき、接続が確立されオープン状態になる", async ({ expect }) => {
    // 実行
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 検証
    expect(storage.isOpen).toBe(true);
  });

  test("すでにオープンされた状態で再度 open を実行したとき、エラーが発生せず状態が維持される", async ({
    expect,
  }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行と検証
    await expect(
      storage.open(createOpenContext({ signal }) as IStorage.OpenContext),
    ).resolves.not.toThrow();
    expect(storage.isOpen).toBe(true);
  });

  test("close を実行したとき、接続が解除されクローズ状態になる", async ({ expect }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行
    await storage.close(createCloseContext({ signal }) as IStorage.CloseContext);

    // 検証
    expect(storage.isOpen).toBe(false);
  });
});

describe("基本データ操作 (CRUD)", () => {
  beforeEach(async () => {
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
  });

  test("データを書き込んだとき、正しく保存される", async ({ expect }) => {
    // 準備
    const key = "k1";
    const data = { message: "hello" };

    // 実行
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

    // 検証
    const exists = await storage.exists(
      createHasContext(key, { signal }) as IStorage.ExistsContext,
    );
    expect(exists).toBe(true);
  });

  test("保存されているデータを読み込んだとき、書き込んだ内容と一致する", async ({ expect }) => {
    // 準備
    const key = "k1";
    const data = "v1";
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

    // 実行
    const result = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);

    // 検証
    expect(result).toBe("v1");
  });

  test("データを削除したとき、そのデータが存在しなくなる", async ({ expect }) => {
    // 準備
    const key = "k1";
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, "v1");

    // 実行
    await storage.delete(createDeleteContext(key, { signal }) as IStorage.DeleteContext);

    // 検証
    const exists = await storage.exists(
      createHasContext(key, { signal }) as IStorage.ExistsContext,
    );
    expect(exists).toBe(false);
  });

  test("clear を実行したとき、すべてのデータが削除される", async ({ expect }) => {
    // 準備
    await storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, "v1");
    await storage.write(createSetContext("k2", { signal }) as IStorage.WriteContext, "v2");

    // 実行
    await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

    // 検証
    const exists1 = await storage.exists(
      createHasContext("k1", { signal }) as IStorage.ExistsContext,
    );
    const exists2 = await storage.exists(
      createHasContext("k2", { signal }) as IStorage.ExistsContext,
    );
    expect(exists1).toBe(false);
    expect(exists2).toBe(false);
  });
});

describe("ストリーム操作", () => {
  beforeEach(async () => {
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
  });

  test("WritableStream を使用してチャンクを書き込んだとき、結合されたデータが保存される", async ({
    expect,
  }) => {
    // 準備
    const key = "stream-key";
    const chunk1 = new Uint8Array([1, 2]);
    const chunk2 = new Uint8Array([3, 4]);
    const writable = storage.getWritable(
      createSetContext(key, { signal }) as IStorage.GetWritableContext,
    );
    const writer = writable.getWriter();

    // 実行
    await writer.write(chunk1);
    await writer.write(chunk2);
    await writer.close();

    // 検証
    const result = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);
    expect(result).toStrictEqual(new Uint8Array([1, 2, 3, 4]));
  });

  test("ReadableStream を使用してデータを読み込んだとき、保存されている内容をストリームとして取得できる", async ({
    expect,
  }) => {
    // 準備
    const key = "read-stream-key";
    const data = new Uint8Array([10, 20, 30]);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

    // 実行
    const readable = storage.getReadable(
      createStreamContext(key, { signal }) as IStorage.GetReadableContext,
    );
    const reader = readable.getReader();
    const chunks: number[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(...value);
    }

    // 検証
    expect(new Uint8Array(chunks)).toStrictEqual(data);
  });

  test("空のチャンクを書き込んだとき、エラーにならず空のデータとして保存される", async ({
    expect,
  }) => {
    // 準備
    const key = "empty-stream";
    const writable = storage.getWritable(
      createSetContext(key, { signal }) as IStorage.GetWritableContext,
    );
    const writer = writable.getWriter();

    // 実行
    await writer.write(new Uint8Array([]));
    await writer.close();

    // 検証
    const result = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);
    expect(result).toStrictEqual(new Uint8Array([]));
  });
});

describe("境界値・異常系", () => {
  test("存在しないキーを読み込もうとしたとき、NotFoundError の DOMException が発生する", async ({
    expect,
  }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const key = "non_existent";

    // 実行と検証
    try {
      await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);
      // 到達してはならない。
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error).toBeInstanceOf(DOMException);
      expect(error.name).toBe("NotFoundError");
    }
  });

  test("特殊文字を含むキーを使用した場合、正しくデータを操作できる", async ({ expect }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const key = "!@#$%^&*()_+";
    const data = "special-key-value";

    // 実行
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);
    const result = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);

    // 検証
    expect(result).toBe(data);
  });

  test("空文字列のキーを使用した場合、IndexedDB の仕様に従い処理される", async ({ expect }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const key = "";
    const data = "empty-key-data";

    // 実行
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);
    const result = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);

    // 検証
    expect(result).toBe(data);
  });

  test("大容量のデータを書き込んだとき、正常に永続化される", async ({ expect }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const key = "large-data";
    const size = 2 * 1024 * 1024; // 2 MB
    const data = new Uint8Array(size).fill(1);

    // 実行
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);
    const result = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);

    // 検証
    expect(result.length).toBe(size);
    expect(result[0]).toBe(1);
    expect(result[size - 1]).toBe(1);
  });
});
