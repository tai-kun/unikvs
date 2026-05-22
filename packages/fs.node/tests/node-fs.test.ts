import { rm, access, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, test, afterEach, beforeEach } from "vitest";

import NodeFs from "../src/node-fs.js";

const TEST_ROOT = join(tmpdir(), "unikvs-nodefs-test-" + Math.random().toString(36).slice(2));

afterEach(async () => {
  // テストごとに生成されたルートディレクトリーを削除する。
  try {
    await rm(TEST_ROOT, { recursive: true, force: true });
  } catch {}
});

describe("初期化と接続管理", () => {
  test("初期状態のとき、isOpen は false である", ({ expect }) => {
    // Arrange
    const storage = new NodeFs(TEST_ROOT);

    // Act & Assert
    expect(storage.isOpen).toBe(false);
  });

  test("open を実行したとき、isOpen が true になりディレクトリが作成される", async ({ expect }) => {
    // Arrange
    const storage = new NodeFs(TEST_ROOT);

    // Act
    await storage.open();

    // Assert
    expect(storage.isOpen).toBe(true);
    await expect(access(TEST_ROOT)).resolves.not.toThrow();
  });
});

describe("基本操作 (CRUD)", () => {
  let storage: NodeFs;

  beforeEach(async () => {
    storage = new NodeFs(TEST_ROOT);
    await storage.open();
  });

  test("データを書き込んだとき、指定された パスにファイルが作成され、内容が一致する", async ({
    expect,
    signal,
  }) => {
    // Arrange
    const key = "test.txt";
    const data = new TextEncoder().encode("Hello World");

    // Act
    await storage.write({ key, data, signal });

    // Assert
    const filePath = join(TEST_ROOT, key);
    const savedData = await readFile(filePath);
    expect(new Uint8Array(savedData)).toStrictEqual(data);
  });

  test("データを読み込んだとき、書き込まれたデータが Uint8Array として正しく返される", async ({
    expect,
    signal,
  }) => {
    // Arrange
    const key = "read-test.bin";
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    await storage.write({ key, data, signal });

    // Act
    const result = await storage.read({ key, signal });

    // Assert
    expect(result).toBeInstanceOf(Uint8Array);
    expect(new Uint8Array(result)).toStrictEqual(data);
  });

  test("存在するファイルのキーで確認したとき、true が返される", async ({ expect, signal }) => {
    // Arrange
    const key = "exists.txt";
    await storage.write({ key, data: new Uint8Array([0]), signal });

    // Act
    const result = await storage.exists({ key });

    // Assert
    expect(result).toBe(true);
  });

  test("存在しないファイルのキーで確認したとき、false が返される", async ({ expect }) => {
    // Arrange
    const key = "non-existent.txt";

    // Act
    const result = await storage.exists({ key });

    // Assert
    expect(result).toBe(false);
  });

  test("ファイルを削除したとき、ファイルが消滅し存在確認が false になる", async ({
    expect,
    signal,
  }) => {
    // Arrange
    const key = "delete-me.txt";
    await storage.write({ key, data: new Uint8Array([0]), signal });

    // Act
    await storage.delete({ key });

    // Assert
    await expect(storage.exists({ key })).resolves.toBe(false);
    await expect(access(join(TEST_ROOT, key))).rejects.toThrow();
  });

  test("clear を実行したとき、ルート内の全てのファイルが削除され、空のディレクトリが維持される", async ({
    expect,
    signal,
  }) => {
    // Arrange
    await storage.write({ key: "file1.txt", data: new Uint8Array([1]), signal });
    await storage.write({ key: "file2.txt", data: new Uint8Array([2]), signal });

    // Act
    await storage.clear();

    // Assert
    await expect(storage.exists({ key: "file1.txt" })).resolves.toBe(false);
    await expect(storage.exists({ key: "file2.txt" })).resolves.toBe(false);
    await expect(access(TEST_ROOT)).resolves.not.toThrow();
  });
});

describe("ストリーム操作", () => {
  let storage: NodeFs;

  beforeEach(async () => {
    storage = new NodeFs(TEST_ROOT);
    await storage.open();
  });

  test("getWritable で取得したストリームを使用したとき、データが正しく書き込める", async ({
    expect,
    signal,
  }) => {
    // Arrange
    const key = "stream-write.txt";
    const data = new TextEncoder().encode("Stream Data");
    const writable = storage.getWritable({ key });

    // Act
    const writer = writable.getWriter();
    await writer.write(data);
    await writer.close();

    // Assert
    const savedData = await storage.read({ key, signal });
    expect(new Uint8Array(savedData)).toStrictEqual(data);
  });

  test("getReadable で取得したストリームを使用したとき、ファイルの内容を正しく読み取れる", async ({
    expect,
    signal,
  }) => {
    // Arrange
    const key = "stream-read.txt";
    const data = new TextEncoder().encode("Readable Stream Content");
    await storage.write({ key, data, signal });

    // Act
    const readable = storage.getReadable({ key, signal });
    const chunks: Uint8Array[] = [];
    const reader = readable.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }

    // Assert
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    expect(result).toStrictEqual(data);
  });
});

describe("境界値・異常系テスト", () => {
  let storage: NodeFs;

  beforeEach(async () => {
    storage = new NodeFs(TEST_ROOT);
    await storage.open();
  });

  test("ディレクトリトラバーサルを含む不正なファイル名を指定したとき、例外が投げられる", async ({
    expect,
    signal,
  }) => {
    // Arrange
    const key = "../etc/passwd";

    // Act & Assert
    await expect(storage.read({ key, signal })).rejects.toThrow();
  });

  test("存在しないファイルを読み込もうとしたとき、ENOENT エラーが投げられる", async ({
    expect,
    signal,
  }) => {
    // Arrange
    const key = "missing.txt";

    // Act & Assert
    await expect(storage.read({ key, signal })).rejects.toThrow(/ENOENT/);
  });

  test("AbortSignal が中断されているとき、書き込み処理が中断され例外が投げられる", async ({
    expect,
  }) => {
    // Arrange
    const key = "abort.txt";
    const data = new Uint8Array([1, 2, 3]);
    const controller = new AbortController();
    controller.abort();

    // Act & Assert
    await expect(storage.write({ key, data, signal: controller.signal })).rejects.toThrow();
  });

  test("既にディレクトリが存在するパスで open を実行したとき、エラー にならず正常に終了する", async ({
    expect,
  }) => {
    // Act & Assert
    await expect(storage.open()).resolves.not.toThrow();
  });

  test("サイズ 0 のデータを書き込んだとき、空のファイルが正常に作成される", async ({
    expect,
    signal,
  }) => {
    // Arrange
    const key = "empty.txt";
    const data = new Uint8Array(0);

    // Act
    await storage.write({ key, data, signal });

    // Assert
    const result = await storage.read({ key, signal });
    expect(Array.from(result)).toStrictEqual(Array.from(data));
  });
});
