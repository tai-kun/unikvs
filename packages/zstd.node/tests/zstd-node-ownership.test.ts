import { describe, test, vi } from "vitest";

import { zlibBridge } from "../src/_zlib.js";
import ZstdNode from "../src/zstd-node.js";

describe("所有化の最適化", () => {
  test("所有済み view は複写せず同一参照を返す", async ({ expect }) => {
    // 準備
    const owned = new Uint8Array([9, 8, 7]);
    const compressSpy = vi.spyOn(zlibBridge, "compress").mockReturnValue(owned);

    try {
      const target = new ZstdNode();

      // 実行
      const encoded = await target.encode({ data: new Uint8Array([1]) });

      // 検証
      expect(encoded).toBe(owned);
      expect(encoded.buffer).toBeInstanceOf(ArrayBuffer);
    } finally {
      compressSpy.mockRestore();
    }
  });

  test("decode の所有済み view は複写せず同一参照を返す", async ({ expect }) => {
    // 準備
    const owned = new Uint8Array([4, 5, 6]);
    const decompressSpy = vi.spyOn(zlibBridge, "decompress").mockReturnValue(owned);

    try {
      const target = new ZstdNode();

      // 実行
      const decoded = await target.decode({ data: new Uint8Array([1]) });

      // 検証
      expect(decoded).toBe(owned);
      expect(decoded.buffer).toBeInstanceOf(ArrayBuffer);
    } finally {
      decompressSpy.mockRestore();
    }
  });

  test("部分的ビューは複写して所有化する", async ({ expect }) => {
    // 準備
    const partial = new Uint8Array([0, 1, 2, 3, 4]).subarray(1, 4);
    const compressSpy = vi.spyOn(zlibBridge, "compress").mockReturnValue(partial);

    try {
      const target = new ZstdNode();

      // 実行
      const encoded = await target.encode({ data: new Uint8Array([1]) });

      // 検証
      expect(encoded).not.toBe(partial);
      expect(encoded).toStrictEqual(new Uint8Array([1, 2, 3]));
      expect(encoded.buffer).toBeInstanceOf(ArrayBuffer);
      expect(encoded.byteOffset).toBe(0);
      expect(encoded.byteLength).toBe(encoded.buffer.byteLength);
    } finally {
      compressSpy.mockRestore();
    }
  });

  test("余白付きビューは複写して所有化する", async ({ expect }) => {
    // 準備
    const view = new Uint8Array(new ArrayBuffer(8), 0, 2);
    view.set([7, 8]);
    const compressSpy = vi.spyOn(zlibBridge, "compress").mockReturnValue(view);

    try {
      const target = new ZstdNode();

      // 実行
      const encoded = await target.encode({ data: new Uint8Array([1]) });

      // 検証
      expect(encoded).not.toBe(view);
      expect(encoded).toStrictEqual(new Uint8Array([7, 8]));
      expect(encoded.buffer).toBeInstanceOf(ArrayBuffer);
      expect(encoded.byteOffset).toBe(0);
      expect(encoded.byteLength).toBe(encoded.buffer.byteLength);
    } finally {
      compressSpy.mockRestore();
    }
  });

  test("SharedArrayBuffer 背後は複写して所有化する", async ({ expect }) => {
    // 準備
    const shared = new Uint8Array(new SharedArrayBuffer(4));
    shared.set([5, 6, 7, 8]);
    const compressSpy = vi.spyOn(zlibBridge, "compress").mockReturnValue(shared);

    try {
      const target = new ZstdNode();

      // 実行
      const encoded = await target.encode({ data: new Uint8Array([1]) });

      // 検証
      expect(encoded).not.toBe(shared);
      expect(encoded).toStrictEqual(new Uint8Array([5, 6, 7, 8]));
      expect(encoded.buffer).toBeInstanceOf(ArrayBuffer);
      expect(encoded.byteOffset).toBe(0);
      expect(encoded.byteLength).toBe(encoded.buffer.byteLength);
    } finally {
      compressSpy.mockRestore();
    }
  });

  test("非 ArrayBuffer 背後は複写して所有化する", async ({ expect }) => {
    // 準備
    const base = new Uint8Array([5, 6, 7, 8]);
    const foreign = new Proxy(base, {
      get(target, property) {
        if (property === "buffer") {
          return { byteLength: target.byteLength };
        }

        return Reflect.get(target, property);
      },
    });
    const compressSpy = vi.spyOn(zlibBridge, "compress").mockReturnValue(foreign);

    try {
      const target = new ZstdNode();

      // 実行
      const encoded = await target.encode({ data: new Uint8Array([1]) });

      // 検証
      expect(encoded === foreign).toBe(false);
      expect(encoded).toStrictEqual(new Uint8Array([5, 6, 7, 8]));
      expect(encoded.buffer).toBeInstanceOf(ArrayBuffer);
      expect(encoded.byteOffset).toBe(0);
      expect(encoded.byteLength).toBe(encoded.buffer.byteLength);
    } finally {
      compressSpy.mockRestore();
    }
  });
});
