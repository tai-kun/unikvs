import { describe } from "vitest";

import { collectBytes, test } from "./_helpers.js";

describe("基本操作 (CRUD)", () => {
  test("データを読み込んだとき、書き込まれたデータが Uint8Array として正しく返される", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "read-test.bin";
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    await storage.write({ key, data, signal, vars: {} });

    // 実行
    const result = await storage.read({ key, signal });

    // 検証
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result).toStrictEqual(data);
  });

  test("存在するキーで確認したとき、true が返される", async ({ expect, signal, storage }) => {
    // 準備
    const key = "exists.txt";
    await storage.write({ key, data: new Uint8Array([0]), signal, vars: {} });

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
    await storage.write({ key, data: new Uint8Array([0]), signal, vars: {} });

    // 実行
    await storage.delete({ key, signal });

    // 検証
    await expect(storage.exists({ key, signal })).resolves.toBe(false);
  });

  test("clear を実行したとき、バケット内の全データが削除される", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    await storage.write({ key: "file1.txt", data: new Uint8Array([1]), signal, vars: {} });
    await storage.write({ key: "file2.txt", data: new Uint8Array([2]), signal, vars: {} });

    // 実行
    await storage.clear({ signal });

    // 検証
    await expect(storage.exists({ key: "file1.txt", signal })).resolves.toBe(false);
    await expect(storage.exists({ key: "file2.txt", signal })).resolves.toBe(false);
  });

  test("clear を実行した後も同じバケットへ書き込める", async ({ expect, signal, storage }) => {
    // 準備
    await storage.write({ key: "before-clear.txt", data: new Uint8Array([1]), signal, vars: {} });
    await storage.clear({ signal });

    // 実行
    await storage.write({ key: "after-clear.txt", data: new Uint8Array([2]), signal, vars: {} });

    // 検証
    await expect(storage.exists({ key: "before-clear.txt", signal })).resolves.toBe(false);
    await expect(storage.read({ key: "after-clear.txt", signal })).resolves.toStrictEqual(
      new Uint8Array([2]),
    );
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
    const writable = storage.getWritable({ key, vars: {}, signal });

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
    await storage.write({ key, data, signal, vars: {} });

    // 実行
    const result = await collectBytes(storage.getReadable({ key, signal }));

    // 検証
    expect(result).toStrictEqual(data);
  });
});
