import { Variables } from "@unikvs/core";
import { abortedSignal, captureRejection, captureThrown } from "@unikvs/testing";
import { describe, test as vitest } from "vitest";

import { KeyNotFoundError } from "../src/errors.js";
import LruCache from "../src/lru-cache.js";

/**
 * テストごとに未オープンの LruCache インスタンスを提供します。
 * トグル型ライフサイクルの振る舞いを検証するために使用します。
 */
const test = vitest.extend<{ storage: LruCache }>({
  // oxlint-disable-next-line no-empty-pattern
  async storage({}, use) {
    await use(new LruCache());
  },
});

/**
 * 未オープン状態での直接操作の一覧です。
 * いずれも TypeError で拒否されることを検証するために使用します。
 * 明示的な NotOpen エラー型は作らず、開閉式の先行例の多数派 (`indexeddb`・`fs`・`s3.node`・`redis` の `con!`・`db!` クラッシュ、`s3.bun` の操作後クラッシュ) に合わせます。
 * UniKvs 経由ではラッパーが StorageIsNotOpenError を投げるため、本仕様は直接操作時のみのものです。
 */
const unopenedOperations: readonly {
  readonly label: string;
  readonly run: (storage: LruCache) => unknown;
}[] = [
  {
    label: "write",
    run: (storage) => storage.write({ vars: new Variables(), key: "k", data: "v" }),
  },
  { label: "read", run: (storage) => storage.read({ key: "k" }) },
  { label: "exists", run: (storage) => storage.exists({ key: "k" }) },
  { label: "delete", run: (storage) => storage.delete({ key: "k" }) },
  {
    label: "getWritable",
    run: (storage) => storage.getWritable({ vars: new Variables(), key: "k" }),
  },
  { label: "getReadable", run: (storage) => storage.getReadable({ key: "k" }) },
];

/**
 * UniKvs のストレージ委譲条件を模擬する状態です。
 * `unikvs/src/_storage.ts:51-70` の `managed` と同一の意味で使用します。
 */
type ManagedState = {
  managed: boolean;
};

/**
 * UniKvs 経由の open 委譲条件を模擬します。
 * `unikvs/src/_storage.ts:51-60` の `!isOpen` 条件と同一であり、実際に呼ばれることを検証するために使用します。
 */
async function openViaUnikvs(
  storage: LruCache,
  signal: AbortSignal,
  state: ManagedState,
): Promise<void> {
  if (typeof storage.open !== "function") {
    return;
  }

  if (!storage.isOpen) {
    state.managed = true;
    await storage.open({ signal });
  }
}

/**
 * UniKvs 経由の close 委譲条件を模擬します。
 * `unikvs/src/_storage.ts:62-70` の `isOpen && managed` 条件と同一であり、実際に呼ばれることを検証するために使用します。
 */
async function closeViaUnikvs(
  storage: LruCache,
  signal: AbortSignal,
  state: ManagedState,
): Promise<void> {
  if (typeof storage.close !== "function") {
    return;
  }

  if (storage.isOpen && state.managed) {
    await storage.close({ signal });
  }
}

describe("ライフサイクル", () => {
  test("name は LruCache である", ({ expect, storage }) => {
    // 実行と検証
    expect(storage.name).toBe("LruCache");
  });

  test("初期状態のとき、isOpen は false である", ({ expect, storage }) => {
    // 実行と検証
    expect(storage.isOpen).toBe(false);
  });

  test("open と close は関数として存在する", ({ expect, storage }) => {
    // 実行と検証
    expect(typeof storage.open).toBe("function");
    expect(typeof storage.close).toBe("function");
  });

  test("open すると isOpen が true になる", async ({ expect, storage, signal }) => {
    // 実行
    await storage.open({ signal });

    // 検証
    expect(storage.isOpen).toBe(true);
  });

  test("open はデータを消さずにオープン状態へ移す", async ({ expect, storage, signal }) => {
    // 準備
    await storage.open({ signal });
    storage.write({ vars: new Variables(), key: "k1", data: "v1" });

    // 実行
    await storage.open({ signal });

    // 検証
    expect(storage.read({ key: "k1" })).toBe("v1");
    expect(storage.isOpen).toBe(true);
  });

  test("open を 2 回呼んでも冪等に成功する", async ({ expect, storage, signal }) => {
    // 実行
    await storage.open({ signal });
    await expect(storage.open({ signal })).resolves.toBe(undefined);

    // 検証
    expect(storage.isOpen).toBe(true);
  });

  test("open を並行に複数回呼び出してもオープン状態になる", async ({ expect, storage, signal }) => {
    // 実行
    await Promise.all([storage.open({ signal }), storage.open({ signal })]);

    // 検証
    expect(storage.isOpen).toBe(true);
  });

  test("中断済みシグナルの open は中断例外を投げて閉じたままである", async ({
    expect,
    storage,
  }) => {
    // 実行
    const error = await captureRejection(storage.open({ signal: abortedSignal() }));

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect(storage.isOpen).toBe(false);
  });

  test("close でキャッシュが消えて isOpen が false になる", async ({ expect, signal }) => {
    // 準備
    const sized = new LruCache({ maxBytes: 10, sizeOf: () => 3 });
    await sized.open({ signal });
    sized.write({ vars: new Variables(), key: "k1", data: "v1" });

    // 実行
    await sized.close({ signal });

    // 検証
    expect(sized.size).toBe(0);
    expect(sized.bytes).toBe(0);
    expect(() => sized.exists({ key: "k1" })).toThrow(TypeError);
    expect(() => sized.read({ key: "k1" })).toThrow(TypeError);
    expect(sized.isOpen).toBe(false);
  });

  test("close 後の read は TypeError で拒否される", async ({ expect, signal }) => {
    // 準備
    const storage = new LruCache();
    await storage.open({ signal });
    storage.write({ vars: new Variables(), key: "k1", data: "v1" });
    await storage.close({ signal });

    // 実行
    const error = captureThrown(() => storage.read({ key: "k1" }));

    // 検証
    expect(error).toBeInstanceOf(TypeError);
    expect(storage.isOpen).toBe(false);
  });

  test("close 後の exists は TypeError で拒否される", async ({ expect, signal }) => {
    // 準備
    const storage = new LruCache();
    await storage.open({ signal });
    storage.write({ vars: new Variables(), key: "k1", data: "v1" });
    await storage.close({ signal });

    // 実行と検証
    expect(() => storage.exists({ key: "k1" })).toThrow(TypeError);
  });

  test("二重 close も冪等に成功する", async ({ expect, storage, signal }) => {
    // 準備
    // 二重 close のクラッシュ前例 (`indexeddb` の `db!.close()`、`redis` の `con!`) には合わせない。
    // close の実体は冪等な clear とフラグの解除だけであり、外部ハンドルを持たないため、冪等な成功を仕様とする。
    await storage.open({ signal });
    storage.write({ vars: new Variables(), key: "k1", data: "v1" });
    await storage.close({ signal });

    // 実行
    await expect(storage.close({ signal })).resolves.toBe(undefined);

    // 検証
    expect(storage.size).toBe(0);
    expect(storage.isOpen).toBe(false);
  });

  test("open 前の close も冪等に成功する", async ({ expect, storage, signal }) => {
    // 実行
    await expect(storage.close({ signal })).resolves.toBe(undefined);

    // 検証
    expect(storage.size).toBe(0);
    expect(storage.isOpen).toBe(false);
  });

  test("中断済みシグナルの close は消去せず中断例外を投げる", async ({ expect, signal }) => {
    // 準備
    const storage = new LruCache();
    await storage.open({ signal });
    storage.write({ vars: new Variables(), key: "k1", data: "v1" });

    // 実行
    const error = await captureRejection(storage.close({ signal: abortedSignal() }));

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect(storage.read({ key: "k1" })).toBe("v1");
    expect(storage.isOpen).toBe(true);
  });

  test("close 後に再 open すると再利用できる", async ({ expect, storage, signal }) => {
    // 準備
    await storage.open({ signal });
    storage.write({ vars: new Variables(), key: "k1", data: "v1" });
    await storage.close({ signal });

    // 実行
    await storage.open({ signal });
    storage.write({ vars: new Variables(), key: "k2", data: "v2" });

    // 検証
    expect(storage.isOpen).toBe(true);
    expect(() => storage.read({ key: "k1" })).toThrow(KeyNotFoundError);
    expect(storage.read({ key: "k2" })).toBe("v2");
  });

  test("CRUD 操作の後も isOpen は true のままである", async ({ expect, storage, signal }) => {
    // 準備
    await storage.open({ signal });

    // 実行
    storage.write({ vars: new Variables(), key: "k1", data: "v1" });
    storage.read({ key: "k1" });
    storage.delete({ key: "k1" });
    storage.clear();

    // 検証
    expect(storage.isOpen).toBe(true);
  });

  test("ストリーム操作の後も isOpen は true のままである", async ({ expect, storage, signal }) => {
    // 準備
    await storage.open({ signal });
    storage.write({ vars: new Variables(), key: "k1", data: new Uint8Array([1]) });

    // 実行
    const writer = storage.getWritable({ vars: new Variables(), key: "k2" }).getWriter();
    await writer.write(new Uint8Array([2]));
    await writer.close();
    const reader = storage.getReadable({ key: "k2" }).getReader();
    await reader.read();

    // 検証
    expect(storage.isOpen).toBe(true);
  });

  test("ストレージを close した後に確定するストリームの close は TypeError で拒否される", async ({
    expect,
    storage,
    signal,
  }) => {
    // 準備
    await storage.open({ signal });
    const writer = storage.getWritable({ vars: new Variables(), key: "k1" }).getWriter();
    await writer.write(new Uint8Array([1]));
    await storage.close({ signal });

    // 実行
    const error = await captureRejection(writer.close());

    // 検証
    expect(error).toBeInstanceOf(TypeError);
    expect(storage.isOpen).toBe(false);
  });

  test("clear は open 不要で何度でも成功する", ({ expect, storage }) => {
    // 実行と検証
    expect(() => storage.clear()).not.toThrow();
    expect(storage.size).toBe(0);
    expect(storage.isOpen).toBe(false);
  });

  test("size と bytes は open 不要で読める", ({ expect, storage }) => {
    // 実行と検証
    expect(storage.size).toBe(0);
    expect(storage.bytes).toBe(0);
    expect(storage.isOpen).toBe(false);
  });

  test("UniKvs 経由で open と close を行うと実際に呼ばれ、close で消える", async ({
    expect,
    signal,
  }) => {
    // 準備
    const storage = new LruCache();
    const state: ManagedState = { managed: false };

    // 実行
    // 初期 isOpen が false のため UniKvs 経由では open が実際に呼ばれる。
    await openViaUnikvs(storage, signal, state);
    expect(state.managed).toBe(true);
    expect(storage.isOpen).toBe(true);
    storage.write({ vars: new Variables(), key: "k1", data: "v1" });
    // managed が true のため UniKvs 経由では close が実際に呼ばれる。
    await closeViaUnikvs(storage, signal, state);

    // 検証
    expect(storage.isOpen).toBe(false);
    expect(storage.size).toBe(0);
    expect(() => storage.read({ key: "k1" })).toThrow(TypeError);
  });

  test("UniKvs の close 後に再 open すると再利用できる", async ({ expect, signal }) => {
    // 準備
    const storage = new LruCache();
    const state: ManagedState = { managed: false };
    await openViaUnikvs(storage, signal, state);
    storage.write({ vars: new Variables(), key: "k1", data: "v1" });
    await closeViaUnikvs(storage, signal, state);

    // 実行
    await openViaUnikvs(storage, signal, state);
    storage.write({ vars: new Variables(), key: "k2", data: "v2" });

    // 検証
    expect(storage.isOpen).toBe(true);
    expect(storage.read({ key: "k2" })).toBe("v2");
  });
});

describe("open していないとき", () => {
  for (const { label, run } of unopenedOperations) {
    test(`${label} は TypeError で拒否される`, ({ expect, storage }) => {
      // 実行
      const error = captureThrown(() => run(storage));

      // 検証
      expect(error).toBeInstanceOf(TypeError);
    });
  }
});
