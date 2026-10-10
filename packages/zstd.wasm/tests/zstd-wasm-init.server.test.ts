import { describe, test, vi } from "vitest";

/**
 * 中断されていないシグナルを作成します。
 */
function createSignal(): AbortSignal {
  return new AbortController().signal;
}

// 上流モジュールの実測では同一プロセス内の init 呼び出しは 3 回まで有効であり、4 回目以降の呼び出し後に圧縮が失敗する。
// open の共有 4 件は上流の init を呼ばないスタブのため呼び出し回数のみを検証する。
// 機能往復は再試行の 1 件と他ファイルの往復群で保証する。
// REVIEW-v2 may-1 の fulfilled 主張は単独実行で rejected になり得るため見送る。
// then 形は拒否を undefined に変換するため status 検証が自明であり回数のみを見る。
describe("WASM 初期化の共有", () => {
  test("並行 open では init が 1 回だけ実行される", async ({ expect }) => {
    // 準備
    vi.resetModules();

    try {
      const fresh = await import("../src/zstd-wasm.js");
      const freshBridge = await import("../src/_zstd-wasm.js");
      const initSpy = vi.spyOn(freshBridge.wasmBridge, "init").mockResolvedValue(undefined);
      const { default: FreshZstdWasm } = fresh;
      const first = new FreshZstdWasm();
      const second = new FreshZstdWasm();

      // 実行
      await Promise.all([
        first.open({ signal: createSignal() }),
        second.open({ signal: createSignal() }),
      ]);

      // 検証
      expect(initSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.restoreAllMocks();
    }
  });

  test("逐次 open では 2 回目に init が再実行されない", async ({ expect }) => {
    // 準備
    vi.resetModules();

    try {
      const fresh = await import("../src/zstd-wasm.js");
      const freshBridge = await import("../src/_zstd-wasm.js");
      const initSpy = vi.spyOn(freshBridge.wasmBridge, "init").mockResolvedValue(undefined);
      const { default: FreshZstdWasm } = fresh;
      const target = new FreshZstdWasm();

      // 実行
      await target.open({ signal: createSignal() });
      await target.open({ signal: createSignal() });

      // 検証
      expect(initSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.restoreAllMocks();
    }
  });

  test("open 失敗時は ZstdWasmInitError で拒否し isOpen は false のままである", async ({
    expect,
  }) => {
    // 準備
    vi.resetModules();

    try {
      const fresh = await import("../src/zstd-wasm.js");
      const freshErrors = await import("../src/errors.js");
      const freshBridge = await import("../src/_zstd-wasm.js");
      const initSpy = vi
        .spyOn(freshBridge.wasmBridge, "init")
        .mockRejectedValueOnce(new Error("init failure"))
        .mockResolvedValue(undefined);
      const { default: FreshZstdWasm } = fresh;
      const target = new FreshZstdWasm();
      const signal = createSignal();

      // 実行と検証
      await expect(target.open({ signal })).rejects.toThrow(freshErrors.ZstdWasmInitError);
      expect(target.isOpen).toBe(false);

      // 実行と検証
      await target.open({ signal });
      expect(target.isOpen).toBe(true);
      expect(initSpy).toHaveBeenCalledTimes(2);
    } finally {
      vi.restoreAllMocks();
    }
  });

  test("open を2回呼んでも init は1回だけ実行される", async ({ expect }) => {
    // 準備
    vi.resetModules();

    try {
      const fresh = await import("../src/zstd-wasm.js");
      const freshBridge = await import("../src/_zstd-wasm.js");
      const initSpy = vi.spyOn(freshBridge.wasmBridge, "init").mockResolvedValue(undefined);
      const { default: FreshZstdWasm } = fresh;
      const target = new FreshZstdWasm();
      const signal = createSignal();

      // 実行
      await target.open({ signal });
      await target.open({ signal });

      // 検証
      expect(initSpy).toHaveBeenCalledTimes(1);
      expect(target.isOpen).toBe(true);
    } finally {
      vi.restoreAllMocks();
    }
  });

  test("open の並行呼び出しでは init が1回だけ実行される", async ({ expect }) => {
    // 準備
    vi.resetModules();

    try {
      const fresh = await import("../src/zstd-wasm.js");
      const freshBridge = await import("../src/_zstd-wasm.js");
      const initSpy = vi.spyOn(freshBridge.wasmBridge, "init").mockResolvedValue(undefined);
      const { default: FreshZstdWasm } = fresh;
      const target = new FreshZstdWasm();

      // 実行
      await Promise.allSettled([
        target.open({ signal: createSignal() }),
        target.open({ signal: createSignal() }),
      ]);

      // 検証
      expect(initSpy).toHaveBeenCalledTimes(1);
      expect(target.isOpen).toBe(true);
    } finally {
      vi.restoreAllMocks();
    }
  });

  test("open 失敗時は ZstdWasmInitError で拒否し次回 open で再試行できる", async ({ expect }) => {
    // 準備
    vi.resetModules();

    try {
      const fresh = await import("../src/zstd-wasm.js");
      const freshErrors = await import("../src/errors.js");
      const freshBridge = await import("../src/_zstd-wasm.js");
      const initSpy = vi
        .spyOn(freshBridge.wasmBridge, "init")
        .mockRejectedValueOnce(new Error("init failure"));
      const { default: FreshZstdWasm } = fresh;
      const target = new FreshZstdWasm();
      const input = new Uint8Array([1, 2, 3]);

      // 実行
      const first = await target.open({ signal: createSignal() }).then(
        () => undefined as unknown,
        (error: unknown) => error,
      );

      // 検証
      expect(first).toBeInstanceOf(freshErrors.ZstdWasmInitError);
      expect((first as InstanceType<typeof freshErrors.ZstdWasmInitError>).cause).toBeInstanceOf(
        Error,
      );
      expect(target.isOpen).toBe(false);

      // 実行
      await target.open({ signal: createSignal() });
      const encoded = await target.encode({ data: input });
      const decoded = await target.decode({ data: encoded });

      // 検証
      expect(decoded).toStrictEqual(input);
      expect(target.isOpen).toBe(true);
      expect(initSpy).toHaveBeenCalledTimes(2);
    } finally {
      vi.restoreAllMocks();
    }
  });
});
