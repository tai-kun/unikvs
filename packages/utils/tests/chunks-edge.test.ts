import { describe, test } from "vitest";

import chunks from "../src/chunks.js";

describe("chunks", () => {
  describe("境界値", () => {
    test("要素が 1 つだけのデータを 1 チャンクで返す", ({ expect }) => {
      // 準備
      const data = new Uint8Array([42]);

      // 実行
      const result = [...chunks(data, 8)];

      // 検証
      expect(result).toStrictEqual([new Uint8Array([42])]);
    });

    test("小数のチャンクサイズは小数点以下を切り捨てる", ({ expect }) => {
      // 準備
      const data = new Uint8Array([1, 2, 3, 4, 5]);

      // 実行
      const result = [...chunks(data, 2.9)];

      // 検証
      expect(result).toStrictEqual([
        new Uint8Array([1, 2]),
        new Uint8Array([3, 4]),
        new Uint8Array([5]),
      ]);
    });

    test("Infinity のチャンクサイズはデータ全体を 1 チャンクにする", ({ expect }) => {
      // 準備
      const data = new Uint8Array([1, 2, 3]);

      // 実行
      const result = [...chunks(data, Infinity)];

      // 検証
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(new Uint8Array([1, 2, 3]));
    });

    test("負のチャンクサイズでも最低 1 バイトずつ返す", ({ expect }) => {
      // 準備
      const data = new Uint8Array([1, 2, 3]);

      // 実行
      const result = [...chunks(data, -10)];

      // 検証
      expect(result).toStrictEqual([new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3])]);
    });

    test("チャンクサイズ 0 でも先頭のチャンクは 1 バイトになる", ({ expect }) => {
      // 準備
      const data = new Uint8Array([1, 2, 3]);

      // 実行
      const iterator = chunks(data, 0);
      const first = iterator.next();

      // 検証: 無限ループを避けるため先頭のチャンクだけを確認する
      expect(first.done).toBe(false);
      expect(first.value).toStrictEqual(new Uint8Array([1]));
    });

    test("端数のあるデータでは最後のチャンクだけが小さくなる", ({ expect }) => {
      // 準備
      const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7]);

      // 実行
      const result = [...chunks(data, 4)];

      // 検証
      expect(result).toStrictEqual([new Uint8Array([1, 2, 3, 4]), new Uint8Array([5, 6, 7])]);
    });
  });

  describe("型付き配列", () => {
    test("Uint16Array をバイト単位のサイズで分割する", ({ expect }) => {
      // 準備
      const data = Uint16Array.from([1, 2, 3, 4]);

      // 実行: 3 バイト指定では 1 要素 (2 バイト) ずつになる
      const result = [...chunks(data, 3)];

      // 検証
      expect(result).toHaveLength(4);
      expect(result.every((part) => part.length === 1)).toBe(true);
      expect(result.flatMap((part) => [...part])).toStrictEqual([1, 2, 3, 4]);
    });

    test("Uint32Array をバイト単位のサイズで分割する", ({ expect }) => {
      // 準備
      const data = Uint32Array.from([10, 20, 30]);

      // 実行: 7 バイト指定では 1 要素 (4 バイト) ずつになる
      const result = [...chunks(data, 7)];

      // 検証
      expect(result.every((part) => part.length === 1)).toBe(true);
      expect(result.flatMap((part) => [...part])).toStrictEqual([10, 20, 30]);
    });

    test("Float64Array をバイト単位のサイズで分割する", ({ expect }) => {
      // 準備
      const data = Float64Array.from([1.5, 2.5, 3.5]);

      // 実行: 16 バイト指定では 2 要素ずつになる
      const result = [...chunks(data, 16)];

      // 検証
      expect(result.map((part) => part.length)).toStrictEqual([2, 1]);
      expect(result[0]).toEqual(Float64Array.from([1.5, 2.5]));
      expect(result[1]).toEqual(Float64Array.from([3.5]));
    });

    test("BigInt64Array をバイト単位のサイズで分割する", ({ expect }) => {
      // 準備
      const data = BigInt64Array.from([1n, 2n, 3n]);

      // 実行: 9 バイト指定では 1 要素 (8 バイト) ずつになる
      const result = [...chunks(data, 9)];

      // 検証
      expect(result.every((part) => part.length === 1)).toBe(true);
      expect(result.flatMap((part) => [...part])).toStrictEqual([1n, 2n, 3n]);
    });

    test("バッファーの一部を参照する型付き配列を分割する", ({ expect }) => {
      // 準備
      const buffer = new ArrayBuffer(16);
      new Uint16Array(buffer).set([1, 2, 3, 4, 5, 6, 7, 8]);
      const view = new Uint16Array(buffer, 4, 4);

      // 実行
      const result = [...chunks(view, 4)];

      // 検証
      expect(result).toStrictEqual([new Uint16Array([3, 4]), new Uint16Array([5, 6])]);
      expect(result.every((part) => part.buffer === buffer)).toBe(true);
    });
  });

  describe("DataView", () => {
    test("オフセットを持つ DataView を元データの範囲内で分割する", ({ expect }) => {
      // 準備
      const buffer = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).buffer;
      const view = new DataView(buffer, 4, 5);

      // 実行
      const result = [...chunks(view, 2)];

      // 検証
      expect(result.map((part) => part.byteOffset)).toStrictEqual([4, 6, 8]);
      expect(result.map((part) => part.byteLength)).toStrictEqual([2, 2, 1]);
      expect(result.every((part) => part.buffer === buffer)).toBe(true);
      expect(
        result.map((part) => new Uint8Array(part.buffer, part.byteOffset, part.byteLength)),
      ).toStrictEqual([new Uint8Array([4, 5]), new Uint8Array([6, 7]), new Uint8Array([8])]);
    });
  });

  describe("ビューの性質", () => {
    test("チャンクは元データと同じバッファーを共有する", ({ expect }) => {
      // 準備
      const data = new Uint8Array([1, 2, 3, 4]);

      // 実行
      const result = [...chunks(data, 2)];

      // 検証
      expect(result.every((part) => part.buffer === data.buffer)).toBe(true);
    });

    test("チャンクへの書き込みが元データに反映される", ({ expect }) => {
      // 準備
      const data = new Uint8Array([1, 2, 3]);
      const result = [...chunks(data, 2)];

      // 実行
      result[0]!.set([99, 98]);

      // 検証
      expect(data).toStrictEqual(new Uint8Array([99, 98, 3]));
    });
  });
});
