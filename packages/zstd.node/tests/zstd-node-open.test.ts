import { abortedSignal, captureRejection, createPseudoRandomBytes } from "@unikvs/testing";
import { describe, test, vi } from "vitest";

import ZstdNode from "../src/zstd-node.js";

describe("open による初期化", () => {
  test("初期状態では isOpen が false である", ({ expect }) => {
    // 実行と検証
    expect(new ZstdNode().isOpen).toBe(false);
  });

  test("open 成功で isOpen が true になり往復できる", async ({ expect, signal }) => {
    // 準備
    const target = new ZstdNode();
    const input = createPseudoRandomBytes(128, 31);

    // 実行
    await target.open({ signal });
    const decoded = await target.decode({ data: await target.encode({ data: input }) });

    // 検証
    expect(target.isOpen).toBe(true);
    expect(decoded).toStrictEqual(input);
  });

  test("2 回目の open も成功し初期化は1回だけ実行される", async ({ expect, signal }) => {
    // 準備
    vi.resetModules();

    try {
      const fresh = await import("../src/zstd-node.js");
      const freshCore = await import("../src/_core.js");
      const initSpy = vi.spyOn(freshCore.api, "init");
      const target = new fresh.default();

      try {
        // 実行
        await target.open({ signal });
        await target.open({ signal });

        // 検証
        expect(target.isOpen).toBe(true);
        expect(initSpy).toHaveBeenCalledTimes(1);
      } finally {
        initSpy.mockRestore();
      }
    } finally {
      vi.restoreAllMocks();
    }
  });

  test("並行した open は初期化を共有して成功する", async ({ expect, signal }) => {
    // 準備
    vi.resetModules();

    try {
      const fresh = await import("../src/zstd-node.js");
      const freshCore = await import("../src/_core.js");
      const initSpy = vi.spyOn(freshCore.api, "init");
      const first = new fresh.default();
      const second = new fresh.default();
      const input = createPseudoRandomBytes(128, 32);

      // 実行
      await Promise.all([first.open({ signal }), second.open({ signal })]);
      const decoded = await second.decode({ data: await first.encode({ data: input }) });

      // 検証
      expect(first.isOpen).toBe(true);
      expect(second.isOpen).toBe(true);
      expect(decoded).toStrictEqual(input);
      expect(initSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.restoreAllMocks();
    }
  });
});

describe("open の中断", () => {
  test("中断済み signal では open を中断理由で拒否し isOpen は false のままである", async ({
    expect,
    signal,
  }) => {
    // 準備
    vi.resetModules();

    try {
      const fresh = await import("../src/zstd-node.js");
      const freshCore = await import("../src/_core.js");
      const initSpy = vi.spyOn(freshCore.api, "init");
      const target = new fresh.default();

      try {
        // 実行
        const error = await captureRejection(target.open({ signal: abortedSignal() }));

        // 検証
        // 事前中断では初期化自体を開始しない。
        expect(error).toBeInstanceOf(DOMException);
        expect(target.isOpen).toBe(false);
        expect(initSpy).not.toHaveBeenCalled();

        // 実行と検証
        // 中断はキャッシュを汚さないため、有効な signal では再試行できる。
        await target.open({ signal });
        const input = createPseudoRandomBytes(64, 33);
        const decoded = await target.decode({ data: await target.encode({ data: input }) });
        expect(decoded).toStrictEqual(input);
        expect(target.isOpen).toBe(true);
        expect(initSpy).toHaveBeenCalledTimes(1);
      } finally {
        initSpy.mockRestore();
      }
    } finally {
      vi.restoreAllMocks();
    }
  });

  test("カスタム reason の中断は reason のまま伝播する", async ({ expect }) => {
    // 準備
    vi.resetModules();

    try {
      const fresh = await import("../src/zstd-node.js");
      const target = new fresh.default();
      const reason = new Error("custom-abort");

      // 実行と検証
      await expect(target.open({ signal: abortedSignal(reason) })).rejects.toBe(reason);
      expect(target.isOpen).toBe(false);
    } finally {
      vi.restoreAllMocks();
    }
  });

  test("実行中に中断された open は中断理由で拒否し再試行できる", async ({ expect, signal }) => {
    // 準備
    vi.resetModules();

    try {
      const fresh = await import("../src/zstd-node.js");
      const freshCore = await import("../src/_core.js");
      const initSpy = vi
        .spyOn(freshCore.api, "init")
        .mockImplementationOnce(() => new Promise<never>(() => {}));
      const target = new fresh.default();
      const controller = new AbortController();
      const reason = new Error("mid-flight-abort");

      try {
        // 実行
        const opening = target.open({ signal: controller.signal });
        controller.abort(reason);

        // 検証
        await expect(opening).rejects.toBe(reason);
        expect(target.isOpen).toBe(false);

        // 実行と検証
        // 実行中の破棄はキャッシュを残さないため、有効な signal では再試行できる。
        await target.open({ signal });
        const input = createPseudoRandomBytes(64, 34);
        const decoded = await target.decode({ data: await target.encode({ data: input }) });
        expect(decoded).toStrictEqual(input);
        expect(target.isOpen).toBe(true);
        expect(initSpy).toHaveBeenCalledTimes(2);
      } finally {
        initSpy.mockRestore();
      }
    } finally {
      vi.restoreAllMocks();
    }
  });

  test("開済み状態での中断済み open は拒否するが isOpen は true のままである", async ({
    expect,
    signal,
  }) => {
    // 準備
    const target = new ZstdNode();
    await target.open({ signal });
    const input = createPseudoRandomBytes(64, 35);

    // 実行と検証
    await expect(target.open({ signal: abortedSignal() })).rejects.toBeInstanceOf(DOMException);
    expect(target.isOpen).toBe(true);

    // 実行と検証
    // 既存の実行環境は破棄されないため、引き続き往復できる。
    const decoded = await target.decode({ data: await target.encode({ data: input }) });
    expect(decoded).toStrictEqual(input);
  });
});
