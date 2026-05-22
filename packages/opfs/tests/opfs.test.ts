import { describe, test, beforeEach, afterEach } from "vitest";

import Opfs from "../src/opfs.js";

let storage: Opfs;
const TEST_ROOT = ".unikvs/test";

beforeEach(async () => {
  // 実際の OPFS を使用してインスタンスを作成する。
  storage = new Opfs(TEST_ROOT);

  // 前のテストの影響を除去するために、初期化してクリアする。
  await storage.open();
  await storage.clear();
});

afterEach(async () => {
  // テスト終了後のクリーンアップ。
  if (storage.isOpen) {
    await storage.clear();
  }
});

describe("初期化の振る舞い", () => {
  test("デフォルト設定でオープンしたとき、ディレクトリが確保され、使用可能状態になる", async ({
    expect,
  }) => {
    // Arrange & Act
    await storage.open();

    // Assert
    expect(storage.isOpen).toBe(true);
  });

  test("ルート直下を指定してオープンしたとき、ルートディレクトリが操作対象として設定される", async ({
    expect,
  }) => {
    // Arrange
    const rootStorage = new Opfs("");

    // Act
    await rootStorage.open();

    // Assert
    expect(rootStorage.isOpen).toBe(true);
  });

  test("オープンしていない状態で操作を試みたとき、実行時エラーが発生する", async ({ expect }) => {
    // Arrange
    const uninitializedStorage = new Opfs(TEST_ROOT);
    const key = "test.bin";

    // Act & Assert
    await expect(uninitializedStorage.read({ key })).rejects.toThrow();
  });
});

describe("基本操作 (CRUD) の振る舞い", () => {
  beforeEach(async () => {
    await storage.open();
  });

  test("データを書き込んだとき、エラーなく正常に終了する", async ({ expect }) => {
    // Arrange
    const key = "test.bin";
    const data = new Uint8Array([1, 2, 3]);

    // Act & Assert
    await expect(storage.write({ key, data })).resolves.not.toThrow();
  });

  test("保存されたデータを読み取ったとき、書き込み時と同じ内容が取得できる", async ({ expect }) => {
    // Arrange
    const key = "test.bin";
    const expectedData = new Uint8Array([1, 2, 3]);
    await storage.write({ key, data: expectedData });

    // Act
    const result = await storage.read({ key });

    // Assert
    expect(result).toStrictEqual(expectedData);
  });

  test("存在するキーに対して存在確認をしたとき、真を返す", async ({ expect }) => {
    // Arrange
    const key = "exists.bin";
    await storage.write({ key, data: new Uint8Array([0]) });

    // Act
    const exists = await storage.exists({ key });

    // Assert
    expect(exists).toBe(true);
  });

  test("存在しないキーに対して存在確認をしたとき、偽を返す", async ({ expect }) => {
    // Arrange
    const key = "non_existent.bin";

    // Act
    const exists = await storage.exists({ key });

    // Assert
    expect(exists).toBe(false);
  });

  test("データを削除したとき、その後の存在確認で偽を返す", async ({ expect }) => {
    // Arrange
    const key = "delete_me.bin";
    await storage.write({ key, data: new Uint8Array([0]) });

    // Act
    await storage.delete({ key });
    const exists = await storage.exists({ key });

    // Assert
    expect(exists).toBe(false);
  });
});

describe("ストリーム操作の振る舞い", () => {
  beforeEach(async () => {
    await storage.open();
  });

  test("書き込み用ストリームを取得したとき、WritableStream のインスタンスが返される", async ({
    expect,
  }) => {
    // Arrange
    const key = "stream_write.bin";

    // Act
    const writable = await storage.getWritable({ key });

    // Assert
    expect(writable).toBeInstanceOf(WritableStream);
    await writable.close();
  });

  test("既存ファイルから読み取り用ストリームを取得したとき、ReadableStream のインスタンスが返される", async ({
    expect,
  }) => {
    // Arrange
    const key = "stream_read.bin";
    await storage.write({ key, data: new Uint8Array([1, 2, 3]) });

    // Act
    const readable = await storage.getReadable({ key });

    // Assert
    expect(readable).toBeInstanceOf(ReadableStream);
  });

  test("存在しないファイルから読み取り用ストリームを取得しようとしたとき、例外が発生する", async ({
    expect,
  }) => {
    // Arrange
    const key = "missing_stream.bin";

    // Act & Assert
    await expect(storage.getReadable({ key })).rejects.toThrow();
  });
});

describe("一括削除 (Clear) の振る舞い", () => {
  test("クリアを実行したとき、保存されていたすべてのデータが削除される", async ({ expect }) => {
    // Arrange
    await storage.open();
    const key1 = "file1.bin";
    const key2 = "file2.bin";
    await storage.write({ key: key1, data: new Uint8Array([1]) });
    await storage.write({ key: key2, data: new Uint8Array([2]) });

    // Act
    await storage.clear();

    // Assert
    expect(await storage.exists({ key: key1 })).toBe(false);
    expect(await storage.exists({ key: key2 })).toBe(false);
  });
});

describe("境界値・異常系の振る舞い", () => {
  beforeEach(async () => {
    await storage.open();
  });

  test("不正なファイル名で操作を試みたとき、検証エラーが発生する", async ({ expect }) => {
    // Arrange
    const invalidKey = "/invalid/path";

    // Act & Assert
    await expect(storage.write({ key: invalidKey, data: new Uint8Array() })).rejects.toThrow();
  });

  test("空のデータを書き込んだとき、サイズ 0 のファイルとして正常に保存される", async ({
    expect,
  }) => {
    // Arrange
    const key = "empty.bin";
    const emptyData = new Uint8Array(0);

    // Act
    await storage.write({ key, data: emptyData });
    const result = await storage.read({ key });

    // Assert
    expect(result.length).toBe(0);
    expect(result).toStrictEqual(emptyData);
  });

  test("存在しないファイルを読み取ろうとしたとき、例外が発生する", async ({ expect }) => {
    // Arrange
    const key = "never_created.bin";

    // Act & Assert
    await expect(storage.read({ key })).rejects.toThrow();
  });
});
