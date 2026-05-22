import { describe, test } from "vitest";

import chunks from "../src/chunks.js";

describe("基本動作の検証", () => {
  test("データが最大チャンクサイズで割り切れるとき、等分割されたチャンクが生成される", ({
    expect,
  }) => {
    // Arrange
    const data = new Uint8Array([1, 2, 3, 4]);
    const maxChunkByteSize = 2;

    // Act
    const result = Array.from(chunks(data, maxChunkByteSize));

    // Assert
    expect(result).toStrictEqual([new Uint8Array([1, 2]), new Uint8Array([3, 4])]);
  });

  test("データが最大チャンクサイズで割り切れないとき、最後のチャンクに残りのデータが含まれる", ({
    expect,
  }) => {
    // Arrange
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const maxChunkByteSize = 2;

    // Act
    const result = Array.from(chunks(data, maxChunkByteSize));

    // Assert
    expect(result).toStrictEqual([
      new Uint8Array([1, 2]),
      new Uint8Array([3, 4]),
      new Uint8Array([5]),
    ]);
  });

  test("Int32Array のような複数バイト要素を扱うとき、指定したバイト長に基づいて正しく分割される", ({
    expect,
  }) => {
    // Arrange
    // Int32Array は 1 要素 4 バイトである。
    const data = new Int32Array([1, 2]);
    const maxChunkByteSize = 4;

    // Act
    const result = Array.from(chunks(data, maxChunkByteSize));

    data.BYTES_PER_ELEMENT;

    // Assert
    expect(result).toStrictEqual([new Int32Array([1]), new Int32Array([2])]);
  });

  test("最大チャンクサイズがデータ全体のサイズを上回るとき、一度のイテレーションで全データが生成される", ({
    expect,
  }) => {
    // Arrange
    const data = new Uint8Array([1, 2]);
    const maxChunkByteSize = 10;

    // Act
    const result = Array.from(chunks(data, maxChunkByteSize));

    // Assert
    expect(result).toStrictEqual([new Uint8Array([1, 2])]);
  });
});

describe("境界値および特殊な入力の検証", () => {
  test("空のデータを渡したとき、チャンクは一度も生成されず終了する", ({ expect }) => {
    // Arrange
    const data = new Uint8Array([]);
    const maxChunkByteSize = 10;

    // Act
    const result = Array.from(chunks(data, maxChunkByteSize));

    // Assert
    expect(result).toStrictEqual([]);
  });

  test("最大チャンクサイズが 1 バイトのとき、要素ごとに分割されたチャンクが生成される", ({
    expect,
  }) => {
    // Arrange
    const data = new Uint8Array([1, 2]);
    const maxChunkByteSize = 1;

    // Act
    const result = Array.from(chunks(data, maxChunkByteSize));

    // Assert
    expect(result).toStrictEqual([new Uint8Array([1]), new Uint8Array([2])]);
  });

  test("最大チャンクサイズがデータ全体のサイズと一致するとき、一度のイテレーションで全データが生成される", ({
    expect,
  }) => {
    // Arrange
    const data = new Uint8Array([1, 2, 3]);
    const maxChunkByteSize = 3;

    // Act
    const result = Array.from(chunks(data, maxChunkByteSize));

    // Assert
    expect(result).toStrictEqual([new Uint8Array([1, 2, 3])]);
  });
});

describe("メモリ効率と副作用の検証", () => {
  test("生成されたチャンクは、元のデータと同じメモリ領域を共有している", ({ expect }) => {
    // Arrange
    const data = new Uint8Array([1, 2, 3, 4]);
    const maxChunkByteSize = 2;

    // Act
    const iterator = chunks(data, maxChunkByteSize);
    const firstChunk = iterator.next().value;

    // Assert
    expect(firstChunk).toBeDefined();
    expect(firstChunk!.buffer).toBe(data.buffer);
  });

  test("生成されたチャンクの値を変更したとき、その変更が元のデータにも反映される", ({ expect }) => {
    // Arrange
    const data = new Uint8Array([1, 2, 3, 4]);
    const maxChunkByteSize = 2;

    // Act
    const iterator = chunks(data, maxChunkByteSize);
    const firstChunk = iterator.next().value;

    // 最初の要素を書き換える。
    if (firstChunk) {
      firstChunk[0] = 99;
    }

    // Assert
    expect(data[0]).toBe(99);
  });
});
