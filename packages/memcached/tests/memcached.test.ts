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

import { KeyNotFoundError } from "../src/errors.js";
import Memcached from "../src/memcached.js";
import { test, createStorage } from "./_helpers.js";

describe("初期化と接続管理", () => {
  test("ストレージ名は Memcached である", ({ expect, storage }) => {
    // 準備と実行は constructor で完了している。

    // 検証：
    expect(storage.name).toBe("Memcached");
  });

  test("初期状態のとき、isOpen は false である", ({ client, expect, keyPrefix }) => {
    // 準備：
    const unopened = createStorage(client, keyPrefix);

    // 実行と検証：
    expect(unopened.isOpen).toBe(false);
  });

  test("open を実行したとき、isOpen が true になる", ({ expect, storage }) => {
    // 実行と検証：
    expect(storage.isOpen).toBe(true);
  });

  test("コンストラクターの第 1 引数でもサーバーを指定できる", ({ client, expect }) => {
    // 準備と実行。
    const storage = new Memcached("127.0.0.1:11211", { client });

    // 検証：
    expect(storage.isOpen).toBe(false);

    expect(client.quitCalls).toBe(0);
  });

  test("keyPrefix を省略したとき、既定の接頭辞 unikvs: が使われる", async ({
    client,
    expect,
    signal,
  }) => {
    // 準備：
    const storage = new Memcached(undefined, { client });
    await storage.open(createOpenContext() as IStorage.OpenContext);

    try {
      // 実行：
      await storage.write(
        createSetContext("default-prefix.bin", { signal }) as IStorage.WriteContext,
        new Uint8Array([1]),
      );

      // 検証：
      // 保存キーに既定の接頭辞が付き、値が Base64 で渡ることを確認する。
      expect(client.setCalls).toStrictEqual([
        {
          key: "unikvs:default-prefix.bin",
          value: "AQ==",
          expires: 0,
        },
      ]);
    } finally {
      await storage.close(createCloseContext() as IStorage.CloseContext);
    }
  });
});

describe("基本操作 (CRUD)", () => {
  test("データを読み込んだとき、書き込まれたデータが Uint8Array として正しく返される", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備：
    const key = "read-test.bin";
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

    // 実行：
    const result = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);

    // 検証：
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result).toStrictEqual(data);
  });

  test("存在するキーで確認したとき、true が返される", async ({ expect, signal, storage }) => {
    // 準備：
    const key = "exists.txt";
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([0]),
    );

    // 実行：
    const result = await storage.exists(
      createHasContext(key, { signal }) as IStorage.ExistsContext,
    );

    // 検証：
    expect(result).toBe(true);
  });

  test("存在しないキーで確認したとき、false が返される", async ({ expect, signal, storage }) => {
    // 準備：
    const key = "non-existent.txt";

    // 実行：
    const result = await storage.exists(
      createHasContext(key, { signal }) as IStorage.ExistsContext,
    );

    // 検証：
    expect(result).toBe(false);
  });

  test("存在しないキーを読み込んだとき、KeyNotFoundError が投げられる", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備：
    const key = "missing.bin";

    // 実行と検証：
    await expect(
      storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).rejects.toThrow(KeyNotFoundError);
  });

  test("キーを削除したとき、存在確認が false になる", async ({ expect, signal, storage }) => {
    // 準備：
    const key = "delete-me.txt";
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([0]),
    );

    // 実行：
    await storage.delete(createDeleteContext(key, { signal }) as IStorage.DeleteContext);

    // 検証：
    await expect(
      storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext),
    ).resolves.toBe(false);
  });

  test("clear を実行したとき、すべてのデータが削除される", async ({ expect, signal, storage }) => {
    // 準備：
    await storage.write(
      createSetContext("file1.txt", { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await storage.write(
      createSetContext("file2.txt", { signal }) as IStorage.WriteContext,
      new Uint8Array([2]),
    );

    // 実行：
    await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

    // 検証：
    await expect(
      storage.exists(createHasContext("file1.txt", { signal }) as IStorage.ExistsContext),
    ).resolves.toBe(false);
    await expect(
      storage.exists(createHasContext("file2.txt", { signal }) as IStorage.ExistsContext),
    ).resolves.toBe(false);
  });

  test("clear を実行したとき、別プレフィックスのデータも削除される (flush  semantics)", async ({
    client,
    expect,
    signal,
    keyPrefix,
  }) => {
    // 準備：
    // memcached にキー列挙手段はないため、clear はサーバー全体の flush になります。
    const other = createStorage(client, `other-${keyPrefix}`);
    await other.open(createOpenContext() as IStorage.OpenContext);

    const storage = createStorage(client, keyPrefix);
    await storage.open(createOpenContext() as IStorage.OpenContext);

    try {
      await storage.write(
        createSetContext("mine.bin", { signal }) as IStorage.WriteContext,
        new Uint8Array([1]),
      );
      await other.write(
        createSetContext("theirs.bin", { signal }) as IStorage.WriteContext,
        new Uint8Array([2]),
      );

      // 実行：
      await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

      // 検証：
      await expect(
        other.exists(createHasContext("theirs.bin", { signal }) as IStorage.ExistsContext),
      ).resolves.toBe(false);
    } finally {
      await storage.close(createCloseContext() as IStorage.CloseContext);
      await other.close(createCloseContext() as IStorage.CloseContext);
    }
  });
});
