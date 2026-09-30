import type { IStorage } from "@unikvs/core";
import { describe, test as vitest } from "vitest";

import WriteOnly from "../src/write-only.js";
import { LifecycleStorage, RecordingStorage, StreamStorage } from "./_helpers.js";

/**
 * 各テストに新しい内部ストレージと、それをラップした WriteOnly を提供するフィクスチャーです。
 */
const test = vitest.extend<{
  inner: LifecycleStorage;
  storage: WriteOnly;
}>({
  // oxlint-disable-next-line no-empty-pattern
  async inner({}, use) {
    await use(new LifecycleStorage());
  },
  async storage({ inner }, use) {
    await use(new WriteOnly(inner));
  },
});

describe("基本情報", () => {
  test("name は WriteOnly である", ({ expect, storage }) => {
    // 実行と検証
    expect(storage.name).toBe("WriteOnly");
  });

  test("コンストラクターは allowDelete を真偽値化する", ({ expect, inner }) => {
    // 実行と検証
    expect(new WriteOnly(inner, {}).allowDelete).toBe(false);
    expect(new WriteOnly(inner, { allowDelete: undefined }).allowDelete).toBe(false);
    expect(new WriteOnly(inner, { allowDelete: false }).allowDelete).toBe(false);
    expect(new WriteOnly(inner, { allowDelete: true }).allowDelete).toBe(true);
  });

  test("複数のインスタンスはそれぞれの内部ストレージへ書き込む", async ({ expect }) => {
    // 準備
    const first = new LifecycleStorage();
    const second = new LifecycleStorage();
    const storage = new WriteOnly(first);
    const other = new WriteOnly(second);

    // 実行
    await storage.write({ key: "k1", data: "v1", vars: {}, signal: new AbortController().signal });
    await other.write({ key: "k2", data: "v2", vars: {}, signal: new AbortController().signal });

    // 検証
    expect(first.map.get("k1")).toBe("v1");
    expect(first.map.has("k2")).toBe(false);
    expect(second.map.get("k2")).toBe("v2");
    expect(second.map.has("k1")).toBe(false);
  });
});

describe("書き込みの委譲", () => {
  test("write は受け取った引数をそのまま内部ストレージへ渡す", async ({
    expect,
    inner,
    storage,
  }) => {
    // 準備
    const args = {
      key: "k1",
      data: "v1",
      vars: {},
      signal: new AbortController().signal,
    };

    // 実行
    const result = await storage.write(args);

    // 検証
    expect(result).toBeUndefined();
    expect(inner.writeCount).toBe(1);
    expect(inner.lastWriteArgs).toBe(args);
    expect(inner.read({ key: args.key })).toBe("v1");
  });

  test("write が投げたエラーをそのまま伝播する", async ({ expect, inner, storage }) => {
    // 準備
    const error = new Error("write failed");
    inner.writeError = error;

    // 実行と検証
    await expect(
      storage.write({ key: "k1", data: "v1", vars: {}, signal: new AbortController().signal }),
    ).rejects.toBe(error);
    expect(inner.writeCount).toBe(0);
  });
});

describe("ライフサイクルの委譲", () => {
  test("open は受け取った引数をそのまま内部ストレージへ渡す", async ({
    expect,
    inner,
    storage,
  }) => {
    // 準備
    const args = { vars: {}, signal: new AbortController().signal };

    // 実行
    const result = await storage.open(args);

    // 検証
    expect(result).toBeUndefined();
    expect(inner.openCount).toBe(1);
    expect(inner.lastOpenArgs).toBe(args);
  });

  test("close は受け取った引数をそのまま内部ストレージへ渡す", async ({
    expect,
    inner,
    storage,
  }) => {
    // 準備
    const args = { vars: {}, signal: new AbortController().signal };

    // 実行
    const result = await storage.close(args);

    // 検証
    expect(result).toBeUndefined();
    expect(inner.closeCount).toBe(1);
    expect(inner.lastCloseArgs).toBe(args);
  });

  test("onOtherWriteError は受け取った引数をそのまま内部ストレージへ渡す", async ({
    expect,
    inner,
    storage,
  }) => {
    // 準備
    const args = {
      key: "k1",
      vars: {},
      signal: new AbortController().signal,
      error: {} as IStorage.OnOtherWriteErrorArgs["error"],
    };

    // 実行
    const result = await storage.onOtherWriteError(args);

    // 検証
    expect(result).toBeUndefined();
    expect(inner.otherWriteErrorCount).toBe(1);
    expect(inner.lastOtherWriteErrorArgs).toBe(args);
  });

  test("open・close・onOtherWriteError が投げたエラーをそのまま伝播する", async ({
    expect,
    inner,
    storage,
  }) => {
    // 準備
    const openError = new Error("open failed");
    const closeError = new Error("close failed");
    const otherWriteError = new Error("other write failed");
    inner.openError = openError;
    inner.closeError = closeError;
    inner.otherWriteError = otherWriteError;

    // 実行と検証
    await expect(storage.open({ vars: {}, signal: new AbortController().signal })).rejects.toBe(
      openError,
    );
    await expect(storage.close({ vars: {}, signal: new AbortController().signal })).rejects.toBe(
      closeError,
    );
    await expect(
      storage.onOtherWriteError({
        key: "k1",
        vars: {},
        signal: new AbortController().signal,
        error: {} as IStorage.OnOtherWriteErrorArgs["error"],
      }),
    ).rejects.toBe(otherWriteError);
  });

  test("内部ストレージがライフサイクル操作を持たない場合は何もしない", async ({ expect }) => {
    // 準備
    const storage = new WriteOnly(new RecordingStorage());

    // 実行と検証
    await expect(
      storage.open({ vars: {}, signal: new AbortController().signal }),
    ).resolves.toBeUndefined();
    await expect(
      storage.close({ vars: {}, signal: new AbortController().signal }),
    ).resolves.toBeUndefined();
    await expect(
      storage.onOtherWriteError({
        key: "k1",
        vars: {},
        signal: new AbortController().signal,
        error: {} as IStorage.OnOtherWriteErrorArgs["error"],
      }),
    ).resolves.toBeUndefined();
  });

  test("isOpen は内部ストレージの現在の状態を反映する", ({ expect, inner, storage }) => {
    // 実行と検証
    expect(storage.isOpen).toBe(false);

    inner.isOpenState = true;
    expect(storage.isOpen).toBe(true);

    inner.isOpenState = false;
    expect(storage.isOpen).toBe(false);
  });
});

describe("書き込み用ストリームの委譲", () => {
  test("内部ストレージが getWritable を持つときだけ公開する", ({ expect }) => {
    // 準備
    const withStream = new WriteOnly(new StreamStorage());

    // 実行と検証
    expect("getWritable" in withStream).toBe(true);
    expect(typeof withStream.getWritable).toBe("function");
  });

  test("内部ストレージが getWritable を持たないときは未定義になる", ({ expect }) => {
    // 準備
    const withoutStream = new WriteOnly(new RecordingStorage());

    // 実行と検証
    expect("getWritable" in withoutStream).toBe(false);
    expect(withoutStream.getWritable).toBeUndefined();
  });

  test("getWritable は引数をそのまま渡し、this を内部ストレージに束縛する", async ({ expect }) => {
    // 準備
    const inner = new StreamStorage();
    const storage = new WriteOnly(inner);
    const args = { key: "s1", vars: {}, signal: new AbortController().signal };

    // 実行
    const writable = await storage.getWritable?.(args);

    // 検証
    expect(writable).toBeInstanceOf(WritableStream);
    expect(inner.getWritableCount).toBe(1);
    expect(inner.lastGetWritableArgs).toBe(args);
    expect(inner.lastGetWritableThis).toBe(inner);
  });
});

describe("削除の抑止", () => {
  test("既定では delete は内部ストレージを呼び出さない", async ({ expect, inner, storage }) => {
    // 準備
    const args = { key: "k1", vars: {}, signal: new AbortController().signal };
    inner.map.set("k1", "v1");

    // 実行
    const result = await storage.delete(args);

    // 検証
    expect(result).toBeUndefined();
    expect(inner.deleteCount).toBe(0);
    expect(inner.map.has("k1")).toBe(true);
  });

  test("既定では clear は内部ストレージを呼び出さない", async ({ expect, inner, storage }) => {
    // 準備
    const args = { vars: {}, signal: new AbortController().signal };
    inner.map.set("k1", "v1");

    // 実行
    const result = await storage.clear(args);

    // 検証
    expect(result).toBeUndefined();
    expect(inner.clearCount).toBe(0);
    expect(inner.map.size).toBe(1);
  });

  test("allowDelete が true のとき、delete は引数をそのまま内部へ渡す", async ({
    expect,
    inner,
  }) => {
    // 準備
    const storage = new WriteOnly(inner, { allowDelete: true });
    const args = { key: "k1", vars: {}, signal: new AbortController().signal };
    inner.map.set("k1", "v1");

    // 実行
    const result = await storage.delete(args);

    // 検証
    expect(result).toBeUndefined();
    expect(inner.deleteCount).toBe(1);
    expect(inner.lastDeleteArgs).toBe(args);
    expect(inner.map.has("k1")).toBe(false);
  });

  test("allowDelete が true のとき、clear は引数をそのまま内部へ渡す", async ({
    expect,
    inner,
  }) => {
    // 準備
    const storage = new WriteOnly(inner, { allowDelete: true });
    const args = { vars: {}, signal: new AbortController().signal };
    inner.map.set("k1", "v1");
    inner.map.set("k2", "v2");

    // 実行
    const result = await storage.clear(args);

    // 検証
    expect(result).toBeUndefined();
    expect(inner.clearCount).toBe(1);
    expect(inner.lastClearArgs).toBe(args);
    expect(inner.map.size).toBe(0);
  });

  test("allowDelete が true のとき、delete・clear のエラーをそのまま伝播する", ({
    expect,
    inner,
  }) => {
    // 準備
    const storage = new WriteOnly(inner, { allowDelete: true });
    const deleteError = new Error("delete failed");
    const clearError = new Error("clear failed");
    inner.deleteError = deleteError;
    inner.clearError = clearError;
    const deleteArgs = { key: "k1", vars: {}, signal: new AbortController().signal };
    const clearArgs = { vars: {}, signal: new AbortController().signal };
    let thrownOnDelete: unknown;
    let thrownOnClear: unknown;

    // 実行
    try {
      void storage.delete(deleteArgs);
    } catch (ex) {
      thrownOnDelete = ex;
    }

    try {
      void storage.clear(clearArgs);
    } catch (ex) {
      thrownOnClear = ex;
    }

    // 検証
    expect(thrownOnDelete).toBe(deleteError);
    expect(thrownOnClear).toBe(clearError);
  });
});
