import { abortedSignal, captureRejection } from "@unikvs/testing";
import { describe, test, vi } from "vitest";

import { api } from "../src/_core.js";
import ZstdWasm from "../src/zstd-wasm.js";

describe("open による初期化", () => {
  test("初期状態では isOpen が false である", ({ expect }) => {
    // 実行と検証
    expect(new ZstdWasm().isOpen).toBe(false);
  });

  test("open 成功で isOpen が true になる", async ({ expect, signal }) => {
    // 準備
    const target = new ZstdWasm();

    // 実行
    await target.open({ signal });

    // 検証
    expect(target.isOpen).toBe(true);
  });

  test("中断済み signal では open を拒否し isOpen は false のままである", async ({ expect }) => {
    // 準備
    const initSpy = vi.spyOn(api, "init");
    const target = new ZstdWasm();

    try {
      // 実行
      const error = await captureRejection(target.open({ signal: abortedSignal() }));

      // 検証
      // 事前中断では初期化自体を開始しない。
      expect(error).toBeInstanceOf(DOMException);
      expect(target.isOpen).toBe(false);
      expect(initSpy).not.toHaveBeenCalled();
    } finally {
      initSpy.mockRestore();
    }
  });

  test("open 後に encode と decode を実行できる", async ({ expect, signal }) => {
    // 準備
    const target = new ZstdWasm();
    const input = new Uint8Array([1, 2, 3]);

    // 実行
    await target.open({ signal });
    const encoded = await target.encode({ data: input });
    const decoded = await target.decode({ data: encoded });

    // 検証
    expect(target.isOpen).toBe(true);
    expect(decoded).toStrictEqual(input);
  });
});
