import { rm, access, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, test, afterEach, beforeEach } from "vitest";

import NodeFs from "../src/node-fs.js";

const TEST_ROOT = join(tmpdir(), "vitest-fs-test-" + Math.random().toString(36).slice(2));

afterEach(async () => {
  // テスト ごとに 生成 された ルートディレクトリ を 削除 する。
  try {
    await rm(TEST_ROOT, { recursive: true, force: true });
  } catch {
    // 削除 失敗 は 無視 する。
  }
});

describe("初期化と接続管理", () => {
  test("初期状態のとき、isOpen は false である", ({ expect }) => {
    // Arrange
    const fs = new NodeFs(TEST_ROOT);

    // Act & Assert
    expect(fs.isOpen).toBe(false);
  });

  test("open を実行したとき、isOpen が true になりディレクトリが作成される", async ({ expect }) => {
    // Arrange
    const fs = new NodeFs(TEST_ROOT);

    // Act
    await fs.open();

    // Assert
    expect(fs.isOpen).toBe(true);
    const dirExists = await access(TEST_ROOT)
      .then(() => true)
      .catch(() => false);
    expect(dirExists).toBe(true);
  });
});

describe("基本操作 (CRUD)", () => {
  let fs: NodeFs;

  beforeEach(async () => {
    fs = new NodeFs(TEST_ROOT);
    await fs.open();
  });

  test("データを書き込んだとき、指定された パスにファイルが作成され、内容が一致する", async ({
    expect,
    signal,
  }) => {
    // Arrange
    const key = "test.txt";
    const data = new TextEncoder().encode("Hello World");

    // Act
    await fs.write({ key, data, signal });

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
    await fs.write({ key, data, signal });

    // Act
    const result = await fs.read({ key, signal });

    // Assert
    expect(result).toBeInstanceOf(Uint8Array);
    expect(Array.from(result)).toStrictEqual(Array.from(data));
  });

  test("存在するファイルのキーで確認したとき、true が返される", async ({ expect, signal }) => {
    // Arrange
    const key = "exists.txt";
    await fs.write({ key, data: new Uint8Array([0]), signal });

    // Act
    const result = await fs.exists({ key });

    // Assert
    expect(result).toBe(true);
  });

  test("存在しないファイルのキーで確認したとき、false が返される", async ({ expect }) => {
    // Arrange
    const key = "non-existent.txt";

    // Act
    const result = await fs.exists({ key });

    // Assert
    expect(result).toBe(false);
  });

  test("ファイルを削除したとき、ファイルが消滅し存在確認が false になる", async ({
    expect,
    signal,
  }) => {
    // Arrange
    const key = "delete-me.txt";
    await fs.write({ key, data: new Uint8Array([0]), signal });

    // Act
    await fs.delete({ key });

    // Assert
    const exists = await fs.exists({ key });
    expect(exists).toBe(false);
  });

  test("clear を実行したとき、ルート内の全てのファイルが削除され、空のディレクトリが維持される", async ({
    expect,
    signal,
  }) => {
    // Arrange
    await fs.write({ key: "file1.txt", data: new Uint8Array([1]), signal });
    await fs.write({ key: "file2.txt", data: new Uint8Array([2]), signal });

    // Act
    await fs.clear();

    // Assert
    expect(await fs.exists({ key: "file1.txt" })).toBe(false);
    expect(await fs.exists({ key: "file2.txt" })).toBe(false);
    const dirExists = await access(TEST_ROOT)
      .then(() => true)
      .catch(() => false);
    expect(dirExists).toBe(true);
  });
});

describe("ストリーム操作", () => {
  let fs: NodeFs;

  beforeEach(async () => {
    fs = new NodeFs(TEST_ROOT);
    await fs.open();
  });

  test("getWritable で取得したストリームを使用したとき、データが正しく書き込める", async ({
    expect,
    signal,
  }) => {
    // Arrange
    const key = "stream-write.txt";
    const data = new TextEncoder().encode("Stream Data");
    const writable = fs.getWritable({ key });

    // Act
    const writer = writable.getWriter();
    await writer.write(data);
    await writer.close();

    // Assert
    const savedData = await fs.read({ key, signal });
    expect(Array.from(savedData)).toStrictEqual(Array.from(data));
  });

  test("getReadable で取得したストリームを使用したとき、ファイルの内容を正しく読み取れる", async ({
    expect,
    signal,
  }) => {
    // Arrange
    const key = "stream-read.txt";
    const data = new TextEncoder().encode("Readable Stream Content");
    await fs.write({ key, data, signal });

    // Act
    const readable = fs.getReadable({ key, signal });
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
  let fs: NodeFs;

  beforeEach(async () => {
    fs = new NodeFs(TEST_ROOT);
    await fs.open();
  });

  test("ディレクトリトラバーサルを含む不正なファイル名を指定したとき、例外が投げられる", async ({
    expect,
    signal,
  }) => {
    // Arrange
    const key = "../etc/passwd";

    // Act & Assert
    await expect(fs.read({ key, signal })).rejects.toThrow();
  });

  test("存在しないファイルを読み込もうとしたとき、ENOENT エラーが送出される", async ({
    expect,
    signal,
  }) => {
    // Arrange
    const key = "missing.txt";

    // Act & Assert
    await expect(fs.read({ key, signal })).rejects.toThrow(/ENOENT/);
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
    await expect(fs.write({ key, data, signal: controller.signal })).rejects.toThrow();
  });

  test("既にディレクトリが存在するパスで open を実行したとき、エラー にならず正常に終了する", async ({
    expect,
  }) => {
    // Arrange
    // beforeEach で 既に open 済み の 状態。

    // Act & Assert
    await expect(fs.open()).resolves.not.toThrow();
  });

  test("サイズ 0 のデータを書き込んだとき、空のファイルが正常に作成される", async ({
    expect,
    signal,
  }) => {
    // Arrange
    const key = "empty.txt";
    const data = new Uint8Array(0);

    // Act
    await fs.write({ key, data, signal });

    // Assert
    const result = await fs.read({ key, signal });
    expect(Array.from(result)).toStrictEqual(Array.from(data));
  });
});
