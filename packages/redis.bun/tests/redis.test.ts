import { describe } from "vitest";

import Redis from "../src/redis.js";
import { collectBytes, test } from "./_helpers.js";

describe("初期化と接続管理", () => {
  test("ストレージ名は Redis である", ({ expect, storage }) => {
    // 準備と実行は constructor で完了している。

    // 検証
    expect(storage.name).toBe("Redis");
  });

  test("初期状態のとき、isOpen は false である", ({ expect, keyPrefix, url }) => {
    // 準備
    const unopened = new Redis(url, { keyPrefix });

    // 実行と検証
    expect(unopened.isOpen).toBe(false);
  });

  test("open を実行したとき、isOpen が true になる", ({ expect, storage }) => {
    // 実行と検証
    expect(storage.isOpen).toBe(true);
  });
});

describe("基本操作 (CRUD)", () => {
  test("データを読み込んだとき、書き込まれたデータが Uint8Array として正しく返される", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "read-test.bin";
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    await storage.write({ key, data, signal });

    // 実行
    const result = await storage.read({ key, signal });

    // 検証
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result).toStrictEqual(data);
  });

  test("存在するキーで確認したとき、true が返される", async ({ expect, signal, storage }) => {
    // 準備
    const key = "exists.txt";
    await storage.write({ key, data: new Uint8Array([0]), signal });

    // 実行
    const result = await storage.exists({ key, signal });

    // 検証
    expect(result).toBe(true);
  });

  test("存在しないキーで確認したとき、false が返される", async ({ expect, signal, storage }) => {
    // 準備
    const key = "non-existent.txt";

    // 実行
    const result = await storage.exists({ key, signal });

    // 検証
    expect(result).toBe(false);
  });

  test("キーを削除したとき、存在確認が false になる", async ({ expect, signal, storage }) => {
    // 準備
    const key = "delete-me.txt";
    await storage.write({ key, data: new Uint8Array([0]), signal });

    // 実行
    await storage.delete({ key, signal });

    // 検証
    await expect(storage.exists({ key, signal })).resolves.toBe(false);
  });

  test("clear を実行したとき、プレフィックス配下の全データが削除される", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    await storage.write({ key: "file1.txt", data: new Uint8Array([1]), signal });
    await storage.write({ key: "file2.txt", data: new Uint8Array([2]), signal });

    // 実行
    await storage.clear({ signal });

    // 検証
    await expect(storage.exists({ key: "file1.txt", signal })).resolves.toBe(false);
    await expect(storage.exists({ key: "file2.txt", signal })).resolves.toBe(false);
  });

  test("clear を引数なしで実行したときも、プレフィックス配下の全データが削除される", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    await storage.write({ key: "argless.txt", data: new Uint8Array([1]), signal });

    // 実行
    await storage.clear();

    // 検証
    await expect(storage.exists({ key: "argless.txt", signal })).resolves.toBe(false);
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
    const writable = storage.getWritable({ key, signal });

    // 実行
    const writer = writable.getWriter();
    await writer.write(data);
    await writer.close();

    // 検証
    await expect(storage.read({ key, signal })).resolves.toStrictEqual(data);
  });

  test("getReadable で取得したストリームを使用したとき、データの内容を正しく読み取れる", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "stream-read.txt";
    const data = new TextEncoder().encode("Readable Stream Content");
    await storage.write({ key, data, signal });

    // 実行
    const result = await collectBytes(storage.getReadable({ key, signal }));

    // 検証
    expect(result).toStrictEqual(data);
  });
});
