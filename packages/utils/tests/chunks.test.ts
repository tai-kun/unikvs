import { describe, test } from "vitest";

import chunks from "../src/chunks.js";

describe("chunks", () => {
  test("Uint8Array を指定サイズで分割する", ({ expect }) => {
    // 準備
    const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

    // 実行
    const result = [...chunks(data, 3)];

    // 検証
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual(new Uint8Array([1, 2, 3]));
    expect(result[1]).toEqual(new Uint8Array([4, 5, 6]));
    expect(result[2]).toEqual(new Uint8Array([7, 8]));
  });

  test("チャンクサイズがデータより大きい場合は全体を1つにまとめる", ({ expect }) => {
    // 準備
    const data = new Uint8Array([1, 2, 3]);

    // 実行
    const result = [...chunks(data, 100)];

    // 検証
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(new Uint8Array([1, 2, 3]));
  });

  test("空のデータに対して空のジェネレーターを返す", ({ expect }) => {
    // 準備
    const data = new Uint8Array(0);

    // 実行
    const result = [...chunks(data, 3)];

    // 検証
    expect(result).toHaveLength(0);
  });

  test("BYTES_PER_ELEMENT が 4 の Int32Array を正しく分割する", ({ expect }) => {
    // 準備
    const data = new Int32Array([1, 2, 3, 4, 5, 6, 7, 8]);

    // 実行: maxChunkByteSize=10 → 1チャンクあたり最大2要素 (floor(10/4)=2)
    const result = [...chunks(data, 10)];

    // 検証
    expect(result).toHaveLength(4);
    expect(result[0]).toEqual(new Int32Array([1, 2]));
    expect(result[1]).toEqual(new Int32Array([3, 4]));
    expect(result[2]).toEqual(new Int32Array([5, 6]));
    expect(result[3]).toEqual(new Int32Array([7, 8]));
  });

  test("チャンクサイズが要素サイズより小さい場合でも最低1要素を返す", ({ expect }) => {
    // 準備
    const data = new Int32Array([1, 2]);

    // 実行: maxChunkByteSize=1 → floor(1/4)=0 → Math.max(1, 0)=1
    const result = [...chunks(data, 1)];

    // 検証
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(new Int32Array([1]));
    expect(result[1]).toEqual(new Int32Array([2]));
  });

  test("BYTES_PER_ELEMENT と length を持たない DataView 的なオブジェクトを扱う", ({ expect }) => {
    // 準備
    const buffer = new ArrayBuffer(10);
    const data = new Uint8Array(buffer);
    data.set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    // BYTES_PER_ELEMENT なし、length なし、byteLength あり
    const view = {
      byteLength: 10,
      subarray(start: number, end: number) {
        return new Uint8Array(buffer, start, end - start);
      },
    };

    // 実行
    const result = [...chunks(view, 3)];

    // 検証
    expect(result).toHaveLength(4);
    expect(result[0]).toEqual(new Uint8Array([1, 2, 3]));
    expect(result[1]).toEqual(new Uint8Array([4, 5, 6]));
    expect(result[2]).toEqual(new Uint8Array([7, 8, 9]));
    expect(result[3]).toEqual(new Uint8Array([10]));
  });

  test("maxChunkByteSize が 0 以下の場合でも最低 1 要素ずつ返す", ({ expect }) => {
    // 準備
    const data = new Uint8Array([1, 2, 3]);

    // 実行
    const result = [...chunks(data, 0)];

    // 検証
    expect(result).toStrictEqual([new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3])]);
  });

  test("チャンクサイズでちょうど割り切れる場合は余りのチャンクを作らない", ({ expect }) => {
    // 準備
    const data = new Uint8Array([1, 2, 3, 4, 5, 6]);

    // 実行
    const result = [...chunks(data, 3)];

    // 検証
    expect(result).toStrictEqual([new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])]);
  });
});
