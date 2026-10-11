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
