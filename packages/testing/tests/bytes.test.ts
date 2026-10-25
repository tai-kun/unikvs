import { test, describe } from "vite-plus/test";

import {
  toHex,
  toText,
  bytesEqual,
  concatBytes,
  concatChunks,
  splitBySizes,
  splitIntoChunks,
  createAllByteValues,
  createPseudoRandomBytes,
} from "../src/bytes.js";

describe("concatBytes", () => {
  test("チャンク列を連結できる", ({ expect }) => {
    // 準備：
    const chunks = [new Uint8Array([1, 2]), new Uint8Array([3])];

    // 実行：
    const result = concatBytes(chunks);

    // 検証：
    expect(result).toStrictEqual(new Uint8Array([1, 2, 3]));
    expect(concatChunks(chunks)).toStrictEqual(result);
  });
});

describe("bytesEqual", () => {
  test("一致と不一致を判定できる", ({ expect }) => {
    // 実行と検証：
    expect(bytesEqual(new Uint8Array([1]), new Uint8Array([1]))).toBe(true);
    expect(bytesEqual(new Uint8Array([1]), new Uint8Array([2]))).toBe(false);
    expect(bytesEqual(new Uint8Array([1]), new Uint8Array([1, 2]))).toBe(false);
  });
});

describe("決定的なバイト列", () => {
  test("createAllByteValues は 0 から巡る", ({ expect }) => {
    // 実行：
    const result = createAllByteValues(258);

    // 検証：
    expect(result[0]).toBe(0);
    expect(result[255]).toBe(255);
    expect(result[256]).toBe(0);
  });

  test("createPseudoRandomBytes は同じ seed で再現する", ({ expect }) => {
    // 実行：
    const first = createPseudoRandomBytes(16, 42);
    const second = createPseudoRandomBytes(16, 42);

    // 検証：
    expect(first).toStrictEqual(second);
  });
});

describe("変換と分割", () => {
  test("toHex と toText で期待値を組み立てられる", ({ expect }) => {
    // 実行と検証：
    expect(toHex(new Uint8Array([0, 15, 255]))).toBe("000fff");
    expect(toText([new Uint8Array([104, 105])])).toBe("hi");
  });

  test("splitIntoChunks と splitBySizes で分割できる", ({ expect }) => {
    // 準備：
    const data = createAllByteValues(5);

    // 実行：
    const bySize = splitIntoChunks(data, 2);
    const bySizes = splitBySizes(data, [2, 2]);
    const overflow = splitBySizes(data, [2, 2, 2, 2]);

    // 検証：
    expect(concatBytes(bySize)).toStrictEqual(data);
    expect(concatBytes(bySizes)).toStrictEqual(data);
    expect(concatBytes(overflow)).toStrictEqual(data);
    expect(bySize).toHaveLength(3);
  });
});
