import { describe, test, vi } from "vitest";

// 上流モジュールの実測では同一プロセス内の init 呼び出しは共有キャッシュで1回だけ実行される。
// 共有の検証はモジュールを再読み込みした新鮮な実体で行い、呼び出し回数のみを検証する。
// 機能往復は再試行の 1 件と他ファイルの往復群で保証する。
// REVIEW-v2 may-1 の fulfilled 主張は単独実行で rejected になり得るため見送る。
// then 形は拒否を undefined に変換するため status 検証が自明であり回数のみを見る。
// 理由: wasm に streaming API はなく、zstd-node-errors の欠落 env (withoutCompress/withoutDecompress)
// による open 成功後の TypeError 検証は open 共有の範囲外のため追加しない。
describe("WASM 初期化の共有", () => {
  test("並行 open では init が 1 回だけ実行される", async ({ expect, signal }) => {
    // 準備
    vi.resetModules();

    try {
      const fresh = await import("../src/zstd-wasm.js");
      const freshCore = await import("../src/_core.js");
      const initSpy = vi.spyOn(freshCore.api, "init");
      const { default: FreshZstdWasm } = fresh;
      const first = new FreshZstdWasm();
      const second = new FreshZstdWasm();

      try {
        // 実行
        await Promise.all([first.open({ signal }), second.open({ signal })]);

        // 検証
        expect(initSpy).toHaveBeenCalledTimes(1);
      } finally {
        initSpy.mockRestore();
      }
    } finally {
      vi.restoreAllMocks();
    }
  });

  test("逐次 open では 2 回目に init が再実行されない", async ({ expect, signal }) => {
    // 準備
    vi.resetModules();

    try {
      const fresh = await import("../src/zstd-wasm.js");
      const freshCore = await import("../src/_core.js");
      const initSpy = vi.spyOn(freshCore.api, "init");
      const { default: FreshZstdWasm } = fresh;
      const target = new FreshZstdWasm();

      try {
        // 実行
        await target.open({ signal });
        await target.open({ signal });

        // 検証
        expect(initSpy).toHaveBeenCalledTimes(1);
      } finally {
        initSpy.mockRestore();
      }
    } finally {
      vi.restoreAllMocks();
    }
  });

  test("open 失敗時は ZstdWasmInitError で拒否し isOpen は false のままである", async ({
    expect,
    signal,
  }) => {
    // 準備
    vi.resetModules();

    try {
      const fresh = await import("../src/zstd-wasm.js");
      const freshErrors = await import("../src/errors.js");
      const freshCore = await import("../src/_core.js");
      const initSpy = vi
        .spyOn(freshCore.api, "init")
        .mockRejectedValueOnce(new Error("init failure"));
      const { default: FreshZstdWasm } = fresh;
      const target = new FreshZstdWasm();

      try {
        // 実行と検証
        await expect(target.open({ signal })).rejects.toThrow(freshErrors.ZstdWasmInitError);
        expect(target.isOpen).toBe(false);

        // 実行と検証
        await target.open({ signal });
        expect(target.isOpen).toBe(true);
        expect(initSpy).toHaveBeenCalledTimes(2);
      } finally {
        initSpy.mockRestore();
      }
    } finally {
      vi.restoreAllMocks();
    }
  });

  test("open を2回呼んでも init は1回だけ実行される", async ({ expect, signal }) => {
    // 準備
    vi.resetModules();

    try {
      const fresh = await import("../src/zstd-wasm.js");
      const freshCore = await import("../src/_core.js");
      const initSpy = vi.spyOn(freshCore.api, "init");
      const { default: FreshZstdWasm } = fresh;
      const target = new FreshZstdWasm();

      try {
        // 実行
        await target.open({ signal });
        await target.open({ signal });

        // 検証
        expect(initSpy).toHaveBeenCalledTimes(1);
        expect(target.isOpen).toBe(true);
      } finally {
        initSpy.mockRestore();
      }
    } finally {
      vi.restoreAllMocks();
    }
  });

  test("open の並行呼び出しでは init が1回だけ実行される", async ({ expect, signal }) => {
    // 準備
    vi.resetModules();

    try {
      const fresh = await import("../src/zstd-wasm.js");
      const freshCore = await import("../src/_core.js");
      const initSpy = vi.spyOn(freshCore.api, "init");
      const { default: FreshZstdWasm } = fresh;
      const target = new FreshZstdWasm();

      try {
        // 実行
        await Promise.allSettled([target.open({ signal }), target.open({ signal })]);

        // 検証
        expect(initSpy).toHaveBeenCalledTimes(1);
        expect(target.isOpen).toBe(true);
      } finally {
        initSpy.mockRestore();
      }
    } finally {
      vi.restoreAllMocks();
    }
  });

  test("open 失敗時は ZstdWasmInitError で拒否し次回 open で再試行できる", async ({
    expect,
    signal,
  }) => {
    // 準備
    vi.resetModules();

    try {
      const fresh = await import("../src/zstd-wasm.js");
      const freshErrors = await import("../src/errors.js");
      const freshCore = await import("../src/_core.js");
      const initSpy = vi
        .spyOn(freshCore.api, "init")
        .mockRejectedValueOnce(new Error("init failure"));
      const { default: FreshZstdWasm } = fresh;
      const target = new FreshZstdWasm();
      const input = new Uint8Array([1, 2, 3]);

      try {
        // 実行
        const first = await target.open({ signal }).then(
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
        await target.open({ signal });
        const encoded = await target.encode({ data: input });
        const decoded = await target.decode({ data: encoded });

        // 検証
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
});
