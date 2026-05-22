import { describe, test, beforeEach } from "vitest";

import { KeyNotFoundError, InvalidChunkTypeError } from "../src/errors.js";
import Memory from "../src/memory.js";

describe("初期化と接続管理", () => {
  let storage: Memory;

  beforeEach(async () => {
    storage = new Memory();
  });

  test("初期状態のとき、isOpen は true である", ({ expect }) => {
    // Act & Assert
    expect(storage.isOpen).toBe(true);
  });
});

describe("基本操作（CRUD）", () => {
  let storage: Memory;

  beforeEach(async () => {
    storage = new Memory();
  });

  test("データを保存したとき、そのキーでデータを取得できる", async ({ expect }) => {
    // Arrange
    const key = "k1";
    const data = "v1";

    // Act
    storage.write({ key, data });
    const result = storage.read({ key });

    // Assert
    expect(result).toBe(data);
  });

  test("データが存在するとき、exists が true を返す", ({ expect }) => {
    // Arrange
    const key = "k1";
    storage.write({ key, data: "v1" });

    // Act
    const result = storage.exists({ key });

    // Assert
    expect(result).toBe(true);
  });

  test("データが存在しないとき、exists が false を返す", ({ expect }) => {
    // Act
    const result = storage.exists({ key: "none" });

    // Assert
    expect(result).toBe(false);
  });

  test("データを削除したとき、そのデータが存在しなくなる", ({ expect }) => {
    // Arrange
    const key = "k1";
    storage.write({ key, data: "v1" });

    // Act
    storage.delete({ key });

    // Assert
    expect(storage.exists({ key })).toBe(false);
  });

  test("全データを消去したとき、すべてのキーが存在しなくなる", ({ expect }) => {
    // Arrange
    storage.write({ key: "k1", data: "v1" });
    storage.write({ key: "k2", data: "v2" });

    // Act
    storage.clear();

    // Assert
    expect(storage.exists({ key: "k1" })).toBe(false);
    expect(storage.exists({ key: "k2" })).toBe(false);
  });

  test("既存のキーに対してデータを書き込んだとき、値が更新される", ({ expect }) => {
    // Arrange
    const key = "k1";
    storage.write({ key, data: "v1" });

    // Act
    storage.write({ key, data: "v2" });
    const result = storage.read({ key });

    // Assert
    expect(result).toBe("v2");
  });
});

describe("ストリーム操作", () => {
  let storage: Memory;

  beforeEach(async () => {
    storage = new Memory();
  });

  test("WritableStream を使用して書き込んだとき、結合された Uint8Array として取得できる", async ({
    expect,
  }) => {
    // Arrange

    const key = "s1";
    const writable = storage.getWritable({ key });
    const writer = writable.getWriter();

    // Act
    await writer.write(new Uint8Array([1, 2]));
    await writer.write(new Uint8Array([3]));
    await writer.close();

    // Assert
    const result = storage.read({ key });
    expect(result).toStrictEqual(new Uint8Array([1, 2, 3]));
  });

  test("ReadableStream を使用して読み取ったとき、保存されているバイナリデータを正常に抽出できる", async ({
    expect,
  }) => {
    // Arrange

    const key = "s1";
    const data = new Uint8Array([1, 2, 3]);
    storage.write({ key, data });

    // Act
    const readable = storage.getReadable({ key });
    const reader = readable.getReader();
    const chunks: number[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(...Array.from(value));
      }
    }

    // Assert
    expect(new Uint8Array(chunks)).toStrictEqual(data);
  });

  test("空のストリームを書き込んだとき、長さ 0 の Uint8Array が保存される", async ({ expect }) => {
    // Arrange

    const key = "s2";
    const writable = storage.getWritable({ key });

    // Act
    await writable.getWriter().close();

    // Assert
    const result = storage.read({ key });
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result?.length).toBe(0);
  });
});

describe("異常系・エラーハンドリング", () => {
  let storage: Memory;

  beforeEach(async () => {
    storage = new Memory();
  });

  test("未登録のキーを読み取ろうとしたとき、KeyNotFoundError が発生する", ({ expect }) => {
    // Act & Assert
    expect(() => storage.read({ key: "unknown" })).toThrow(KeyNotFoundError);
  });

  test("未登録のキーを削除しようとしたとき、KeyNotFoundError が発生する", ({ expect }) => {
    // Act & Assert
    expect(() => storage.delete({ key: "unknown" })).toThrow(KeyNotFoundError);
  });

  test("WritableStream に Uint8Array 以外の型を書き込んだとき、InvalidChunkTypeError が発生する", async ({
    expect,
  }) => {
    // Arrange
    const writable = storage.getWritable({ key: "s1" });
    const writer = writable.getWriter();

    // Act & Assert
    // ストリームの書き込みエラーは通常 writer.closed や write() の Promise 拒否で発生する
    await expect(writer.write("invalid chunk" as any)).rejects.toThrow(InvalidChunkTypeError);
  });

  test("バイナリデータではないキーに対して ReadableStream を取得して読み取ったとき、InvalidChunkTypeError が発生する", async ({
    expect,
  }) => {
    // Arrange
    const key = "k1";
    storage.write({ key, data: { a: 1 } }); // オブジェクトを保存

    // Act
    const readable = storage.getReadable({ key });
    const reader = readable.getReader();

    // Assert
    await expect(reader.read()).rejects.toThrow(InvalidChunkTypeError);
  });
});

describe("境界値・特殊ケース", () => {
  let storage: Memory;

  beforeEach(async () => {
    storage = new Memory();
  });

  test("空文字のキーを使用しても、正常に保存と取得ができる", ({ expect }) => {
    // Arrange
    const key = "";
    const data = "empty key data";

    // Act
    storage.write({ key, data });

    // Assert
    expect(storage.read({ key })).toBe(data);
    expect(storage.exists({ key })).toBe(true);
  });

  test("特殊文字を含むキーを使用しても、正常に保存と取得ができる", ({ expect }) => {
    // Arrange
    const key = "path/to/key!@#";
    const data = "special key data";

    // Act
    storage.write({ key, data });

    // Assert
    expect(storage.read({ key })).toBe(data);
  });

  test("null または undefined を保存したとき、そのままの値が取得できる", ({ expect }) => {
    // Act
    storage.write({ key: "null-key", data: null });
    storage.write({ key: "undefined-key", data: undefined });

    // Assert
    expect(storage.read({ key: "null-key" })).toBe(null);
    expect(storage.read({ key: "undefined-key" })).toBe(undefined);
  });

  test("巨大なバイナリデータを保存したとき、整合性を保ったまま取得できる", ({ expect }) => {
    // Arrange
    const size = 10 * 1024 * 1024; // 10 MB
    const bigData = new Uint8Array(size).fill(1);
    const key = "large-data";

    // Act
    storage.write({ key, data: bigData });
    const result = storage.read({ key });

    // Assert
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result?.length).toBe(size);
    expect(result?.[0]).toBe(1);
    expect(result?.[size - 1]).toBe(1);
  });
});
