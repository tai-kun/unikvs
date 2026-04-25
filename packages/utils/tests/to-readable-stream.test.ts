import { test, describe } from "vitest";

import toReadableStream from "../src/to-readable-stream.js";

/**
 * ストリームから全てのデータを読み取って配列として返すヘルパー関数
 */
async function readAllChunks<T>(stream: ReadableStream<T>): Promise<T[]> {
  const reader = stream.getReader();
  const chunks: T[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value !== undefined) {
        chunks.push(value);
      }
    }

    return chunks;
  } finally {
    reader.releaseLock();
  }
}

describe("同期反復可能オブジェクト（Iterable）を渡したとき", () => {
  test("配列を渡したとき、各要素が順番に出力されるストリームが返される", async ({ expect }) => {
    // Arrange
    const input = ["a", "b", "c"];

    // Act
    const stream = toReadableStream(input);
    const result = await readAllChunks(stream);

    // Assert
    expect(result).toStrictEqual(["a", "b", "c"]);
  });

  test("文字列を渡したとき、各文字がチャンクとして出力される", async ({ expect }) => {
    // Arrange
    const input = "abc";

    // Act
    const stream = toReadableStream(input);
    const result = await readAllChunks(stream);

    // Assert
    expect(result).toStrictEqual(["a", "b", "c"]);
  });

  test("空の配列を渡したとき、即座にクローズされる空のストリームが返される", async ({ expect }) => {
    // Arrange
    const input: number[] = [];

    // Act
    const stream = toReadableStream(input);
    const result = await readAllChunks(stream);

    // Assert
    expect(result).toStrictEqual([]);
  });

  test("反復中にエラーが発生したとき、ストリームがエラー状態になる", async ({ expect }) => {
    // Arrange
    const error = new Error("Iteration error");
    const iterable = {
      [Symbol.iterator]() {
        return {
          next() {
            throw error;
          },
        };
      },
    };

    // Act
    const stream = toReadableStream(iterable);
    const reader = stream.getReader();

    // Assert
    await expect(reader.read()).rejects.toThrow(error);
    reader.releaseLock();
  });
});

describe("非同期反復可能オブジェクト（AsyncIterable）を渡したとき", () => {
  test("非同期ジェネレーターを渡したとき、値が非同期に解決されて出力される", async ({ expect }) => {
    // Arrange
    async function* gen() {
      yield 1;
      yield 2;
    }

    // Act
    const stream = toReadableStream(gen());
    const result = await readAllChunks(stream);

    // Assert
    expect(result).toStrictEqual([1, 2]);
  });

  test("非同期反復中に Promise が拒絶されたとき、ストリームにエラーが伝播する", async ({
    expect,
  }) => {
    // Arrange
    const error = new Error("Async iteration error");
    async function* gen() {
      yield 1;
      throw error;
    }

    // Act
    const stream = toReadableStream(gen());
    const reader = stream.getReader();

    // Assert
    await expect(reader.read()).resolves.toMatchObject({ value: 1, done: false });
    await expect(reader.read()).rejects.toThrow(error);
    reader.releaseLock();
  });
});

describe("大規模データを扱うとき", () => {
  test("100,000 要素の配列を渡したとき、全ての要素が欠損なく出力される", async ({ expect }) => {
    // Arrange
    const size = 100000;
    const input = Array.from({ length: size }, (_, i) => i);

    // Act
    const stream = toReadableStream(input);
    const result = await readAllChunks(stream);

    // Assert
    expect(result.length).toBe(size);
    expect(result[0]).toBe(0);
    expect(result[size - 1]).toBe(size - 1);
  });
});

describe("不適切な入力を受け取ったとき", () => {
  test("null を渡したとき、例外がスローされる", ({ expect }) => {
    // Act & Assert
    // @ts-expect-error: テストのために無効な値を渡す
    expect(() => toReadableStream(null)).toThrow();
  });

  test("反復可能ではないオブジェクトを渡したとき、例外がスローされる", ({ expect }) => {
    // Arrange
    const input = { key: "value" };

    // Act & Assert
    // @ts-expect-error: テストのために無効な値を渡す
    expect(() => toReadableStream(input)).toThrow();
  });
});
