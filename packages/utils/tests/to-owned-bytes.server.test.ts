import { describe, test } from "vitest";

import toOwnedBytes from "../src/to-owned-bytes.js";

describe("toOwnedBytes", () => {
  test("プールを共有する Buffer は複写して所有化する", ({ expect }) => {
    // 準備
    // 小さな Buffer は Node.js の共有プールを参照するため、共有域の公開を避けて複写する。
    const pooled = Buffer.from([1, 2, 3]);

    // 実行
    const result = toOwnedBytes(pooled);

    // 検証
    expect(result).not.toBe(pooled);
    expect(result).toStrictEqual(new Uint8Array([1, 2, 3]));
    expect(result.constructor).toBe(Uint8Array);
    expect(result.buffer).toBeInstanceOf(ArrayBuffer);
    expect(result.byteOffset).toBe(0);
    expect(result.byteLength).toBe(result.buffer.byteLength);
  });

  test("専用域の空 Buffer は複写して所有化する", ({ expect }) => {
    // 準備
    // 長さ 0 の Buffer は専用域を持つため、所有判定だけでは素の Uint8Array と区別できない。
    const empty = Buffer.alloc(0);

    // 実行
    const result = toOwnedBytes(empty);

    // 検証
    expect(result).not.toBe(empty);
    expect(result).toStrictEqual(new Uint8Array(0));
    expect(result.constructor).toBe(Uint8Array);
    expect(result.buffer).toBeInstanceOf(ArrayBuffer);
  });

  test("専有域の Buffer は複写せず所有化する", ({ expect }) => {
    // 準備
    // allocUnsafeSlow は共有プールを使わないため、背後の ArrayBuffer をそのまま引き継げる。
    const dedicated = Buffer.allocUnsafeSlow(4);
    dedicated.set([1, 2, 3, 4]);

    // 実行
    const result = toOwnedBytes(dedicated);

    // 検証
    expect(result).not.toBe(dedicated);
    expect(result).toStrictEqual(new Uint8Array([1, 2, 3, 4]));
    expect(result.constructor).toBe(Uint8Array);
    expect(result.buffer).toBe(dedicated.buffer);
    expect(result.byteOffset).toBe(0);
    expect(result.byteLength).toBe(result.buffer.byteLength);
  });

  test("SharedArrayBuffer 背後は複写して所有化する", ({ expect }) => {
    // 準備
    const shared = new Uint8Array(new SharedArrayBuffer(4));
    shared.set([5, 6, 7, 8]);

    // 実行
    const result = toOwnedBytes(shared);

    // 検証
    expect(result).not.toBe(shared);
    expect(result).toStrictEqual(new Uint8Array([5, 6, 7, 8]));
    expect(result.buffer).toBeInstanceOf(ArrayBuffer);
    expect(result.byteOffset).toBe(0);
    expect(result.byteLength).toBe(result.buffer.byteLength);
  });
});
