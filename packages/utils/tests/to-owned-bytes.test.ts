import { test, describe } from "vite-plus/test";

import toOwnedBytes from "../src/to-owned-bytes.js";

describe("toOwnedBytes", () => {
  test("所有済みなら複写せず同一参照を返す", ({ expect }) => {
    // 準備：
    const owned = new Uint8Array([9, 8, 7]);

    // 実行：
    const result = toOwnedBytes(owned);

    // 検証：
    expect(result).toBe(owned);
    expect(result.buffer).toBeInstanceOf(ArrayBuffer);
  });

  test("空の所有済みなら複写せず同一参照を返す", ({ expect }) => {
    // 準備：
    const owned = new Uint8Array(0);

    // 実行：
    const result = toOwnedBytes(owned);

    // 検証：
    expect(result).toBe(owned);
    expect(result).toStrictEqual(new Uint8Array(0));
  });

  test("素の Uint8Array ではない子クラスは複写して所有化する", ({ expect }) => {
    // 準備：
    class ChildBytes extends Uint8Array {}

    const child = new ChildBytes([5, 6, 7]);

    // 実行：
    const result = toOwnedBytes(child);

    // 検証：
    expect(result).not.toBe(child);
    expect(result).toStrictEqual(new Uint8Array([5, 6, 7]));
    expect(result.constructor).toBe(Uint8Array);
    expect(result.buffer).toBeInstanceOf(ArrayBuffer);
    expect(result.byteOffset).toBe(0);
    expect(result.byteLength).toBe(result.buffer.byteLength);
  });

  test("部分的ビューは複写して所有化する", ({ expect }) => {
    // 準備：
    const partial = new Uint8Array([0, 1, 2, 3, 4]).subarray(1, 4);

    // 実行：
    const result = toOwnedBytes(partial);

    // 検証：
    expect(result).not.toBe(partial);
    expect(result).toStrictEqual(new Uint8Array([1, 2, 3]));
    expect(result.buffer).toBeInstanceOf(ArrayBuffer);
    expect(result.byteOffset).toBe(0);
    expect(result.byteLength).toBe(result.buffer.byteLength);
  });

  test("余白付きビューは複写して所有化する", ({ expect }) => {
    // 準備：
    const view = new Uint8Array(new ArrayBuffer(8), 0, 2);
    view.set([7, 8]);

    // 実行：
    const result = toOwnedBytes(view);

    // 検証：
    expect(result).not.toBe(view);
    expect(result).toStrictEqual(new Uint8Array([7, 8]));
    expect(result.buffer).toBeInstanceOf(ArrayBuffer);
    expect(result.byteOffset).toBe(0);
    expect(result.byteLength).toBe(result.buffer.byteLength);
  });

  test("非 ArrayBuffer 背後は複写して所有化する", ({ expect }) => {
    // 準備：
    const base = new Uint8Array([5, 6, 7, 8]);
    const foreign = new Proxy(base, {
      get(target, property): unknown {
        // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
        if (property === "buffer") {
          return { byteLength: target.byteLength };
        }

        return Reflect.get(target, property);
      },
    });

    // 実行：
    const result = toOwnedBytes(foreign);

    // 検証：
    expect(result === foreign).toBe(false);
    expect(result).toStrictEqual(new Uint8Array([5, 6, 7, 8]));
    expect(result.buffer).toBeInstanceOf(ArrayBuffer);
    expect(result.byteOffset).toBe(0);
    expect(result.byteLength).toBe(result.buffer.byteLength);
  });
});
