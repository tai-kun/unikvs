import { describe, test, vi } from "vitest";

import { wasmBridge } from "../src/_zstd-wasm.js";
import ZstdWasm from "../src/zstd-wasm.js";

/**
 * 中断されていないシグナルを作成します。
 */
function createSignal(): AbortSignal {
  return new AbortController().signal;
}

describe("open による初期化", () => {
  test("初期状態では isOpen が false である", ({ expect }) => {
    // 実行と検証
    expect(new ZstdWasm().isOpen).toBe(false);
  });

  test("open 成功で isOpen が true になる", async ({ expect }) => {
    // 準備
    const target = new ZstdWasm();

    // 実行
    await target.open({ signal: createSignal() });

    // 検証
    expect(target.isOpen).toBe(true);
  });

  test("中断済み signal では open を拒否し isOpen は false のままである", async ({ expect }) => {
    // 準備
    const initSpy = vi.spyOn(wasmBridge, "init").mockResolvedValue(undefined);
    const target = new ZstdWasm();
    const controller = new AbortController();
    controller.abort();

    try {
      // 実行と検証
      await expect(target.open({ signal: controller.signal })).rejects.toThrow();
      expect(target.isOpen).toBe(false);
      expect(initSpy).not.toHaveBeenCalled();
    } finally {
      initSpy.mockRestore();
    }
  });

  test("open 後に encode と decode を実行できる", async ({ expect }) => {
    // 準備
    const target = new ZstdWasm();
    const input = new Uint8Array([1, 2, 3]);

    // 実行
    await target.open({ signal: createSignal() });
    const encoded = await target.encode({ data: input });
    const decoded = await target.decode({ data: encoded });

    // 検証
    expect(target.isOpen).toBe(true);
    expect(decoded).toStrictEqual(input);
  });
});

describe("所有化の最適化", () => {
  test("所有済み view は複写せず同一参照を返す", async ({ expect }) => {
    // 準備
    const owned = new Uint8Array([9, 8, 7]);
    const compressSpy = vi.spyOn(wasmBridge, "compress").mockReturnValue(owned);

    try {
      const target = new ZstdWasm();
      await target.open({ signal: createSignal() });

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
    const decompressSpy = vi.spyOn(wasmBridge, "decompress").mockReturnValue(owned);

    try {
      const target = new ZstdWasm();
      await target.open({ signal: createSignal() });

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
    const compressSpy = vi.spyOn(wasmBridge, "compress").mockReturnValue(partial);

    try {
      const target = new ZstdWasm();
      await target.open({ signal: createSignal() });

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
    const compressSpy = vi.spyOn(wasmBridge, "compress").mockReturnValue(view);

    try {
      const target = new ZstdWasm();
      await target.open({ signal: createSignal() });

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

  test.skipIf(__CLIENT__)("SharedArrayBuffer 背後は複写して所有化する", async ({ expect }) => {
    // 準備
    // ブラウザーでは SharedArrayBuffer が未定義のため、サーバーでのみ検証する。
    const shared = new Uint8Array(new SharedArrayBuffer(4));
    shared.set([5, 6, 7, 8]);
    const compressSpy = vi.spyOn(wasmBridge, "compress").mockReturnValue(shared);

    try {
      const target = new ZstdWasm();
      await target.open({ signal: createSignal() });

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
    // ブラウザーでも非所有分岐を検証できるよう、Proxy で背後を差し替える。
    const base = new Uint8Array([5, 6, 7, 8]);
    const foreign = new Proxy(base, {
      get(target, property) {
        if (property === "buffer") {
          return { byteLength: target.byteLength };
        }

        return Reflect.get(target, property);
      },
    });
    const compressSpy = vi.spyOn(wasmBridge, "compress").mockReturnValue(foreign);

    try {
      const target = new ZstdWasm();
      await target.open({ signal: createSignal() });

      // 実行
      const encoded = await target.encode({ data: new Uint8Array([1]) });

      // 検証
      // Proxy を expect に渡すとブラウザーで内部検査が失敗するため、恒等性は真偽値で検証する。
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
