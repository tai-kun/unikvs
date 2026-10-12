import { captureRejection, captureThrown } from "@unikvs/testing";
import { describe, test as vitest } from "vitest";

import { InvalidSizeOfResultError } from "../src/errors.js";
import LruCache from "../src/lru-cache.js";

/**
 * テストごとに容量上限付きの LruCache インスタンスを提供します。
 * sizeOf の検証と、例外時に値が変わらないことの保証を検証するために使用します。
 */
const test = vitest.extend<{ storage: LruCache }>({
  // oxlint-disable-next-line no-empty-pattern
  async storage({}, use) {
    const storage = new LruCache({ maxBytes: 10 });
    await storage.open({ signal: new AbortController().signal });
    await use(storage);
  },
});

describe("sizeOf の検証", () => {
  test("数値以外を返したとき、InvalidSizeOfResultError を投げる", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const bad = new LruCache({ maxBytes: 10, sizeOf: () => "1" as unknown as number });
    await bad.open({ signal });

    // 実行
    const error = captureThrown(() => bad.write({ vars: {}, key: "k1", data: "v1" }));

    // 検証
    expect(error).toBeInstanceOf(InvalidSizeOfResultError);
    expect((error as InvalidSizeOfResultError).meta).toStrictEqual({ key: "k1", actual: "1" });
    expect(storage.exists({ key: "k1" })).toBe(false);
  });

  test("NaN を返したとき、InvalidSizeOfResultError を投げる", async ({ expect, signal }) => {
    // 準備
    const bad = new LruCache({ maxBytes: 10, sizeOf: () => Number.NaN });
    await bad.open({ signal });

    // 実行
    const error = captureThrown(() => bad.write({ vars: {}, key: "k1", data: "v1" }));

    // 検証
    expect(error).toBeInstanceOf(InvalidSizeOfResultError);
    expect(bad.exists({ key: "k1" })).toBe(false);
  });

  test("無限大を返したとき、InvalidSizeOfResultError を投げる", async ({ expect, signal }) => {
    // 準備
    const bad = new LruCache({ maxBytes: 10, sizeOf: () => Number.POSITIVE_INFINITY });
    await bad.open({ signal });

    // 実行
    const error = captureThrown(() => bad.write({ vars: {}, key: "k1", data: "v1" }));

    // 検証
    expect(error).toBeInstanceOf(InvalidSizeOfResultError);
  });

  test("負数を返したとき、InvalidSizeOfResultError を投げる", async ({ expect, signal }) => {
    // 準備
    const bad = new LruCache({ maxBytes: 10, sizeOf: () => -1 });
    await bad.open({ signal });

    // 実行
    const error = captureThrown(() => bad.write({ vars: {}, key: "k1", data: "v1" }));

    // 検証
    expect(error).toBeInstanceOf(InvalidSizeOfResultError);
    expect((error as InvalidSizeOfResultError).meta).toStrictEqual({ key: "k1", actual: -1 });
  });

  test("検証失敗時に既存の値は残る", async ({ expect, signal }) => {
    // 準備
    let bad = false;
    const storage = new LruCache({
      maxBytes: 10,
      sizeOf: () => {
        if (bad) {
          return -1;
        }
        return 1;
      },
    });
    await storage.open({ signal });
    storage.write({ vars: {}, key: "k1", data: "old" });
    bad = true;

    // 実行
    captureThrown(() => storage.write({ vars: {}, key: "k1", data: "new" }));

    // 検証
    expect(storage.read({ key: "k1" })).toBe("old");
    expect(storage.bytes).toBe(1);
  });

  test("sizeOf 自身が投げたとき、そのエラーが伝播し、値は変わらない", async ({
    expect,
    signal,
  }) => {
    // 準備
    const storage = new LruCache({
      maxBytes: 10,
      sizeOf: () => {
        throw new Error("sizeOf failed");
      },
    });
    await storage.open({ signal });

    // 実行
    const error = captureThrown(() => storage.write({ vars: {}, key: "k1", data: "v1" }));

    // 検証
    expect((error as Error).message).toBe("sizeOf failed");
    expect(storage.exists({ key: "k1" })).toBe(false);
  });

  test("-0 を返したとき、0 相当として受理される", async ({ expect, signal }) => {
    // 準備
    const storage = new LruCache({ maxBytes: 10, sizeOf: () => -0 });
    await storage.open({ signal });

    // 実行
    storage.write({ vars: {}, key: "k1", data: "v1" });

    // 検証
    expect(storage.read({ key: "k1" })).toBe("v1");
    expect(storage.bytes).toBe(0);
  });

  test("maxBytes 未設定時は sizeOf を呼ばない", async ({ expect, signal }) => {
    // 準備
    let calls = 0;
    const storage = new LruCache({
      sizeOf: () => {
        calls += 1;
        return 1;
      },
    });
    await storage.open({ signal });

    // 実行
    storage.write({ vars: {}, key: "k1", data: "v1" });

    // 検証
    expect(calls).toBe(0);
  });

  test("上書き時も毎回 sizeOf を呼ぶ", async ({ expect, signal }) => {
    // 準備
    let calls = 0;
    const storage = new LruCache({
      maxBytes: 10,
      sizeOf: () => {
        calls += 1;
        return 1;
      },
    });
    await storage.open({ signal });

    // 実行
    storage.write({ vars: {}, key: "k1", data: "v1" });
    storage.write({ vars: {}, key: "k1", data: "v2" });

    // 検証
    expect(calls).toBe(2);
  });

  test("getWritable の取得時には呼ばず、ストリームの close 時に 1 回呼ぶ", async ({
    expect,
    signal,
  }) => {
    // 準備
    let calls = 0;
    const storage = new LruCache({
      maxBytes: 10,
      sizeOf: () => {
        calls += 1;
        return 2;
      },
    });
    await storage.open({ signal });
    const writer = storage.getWritable({ vars: {}, key: "k1" }).getWriter();

    // 実行
    await writer.write(new Uint8Array([1, 2]));
    const callsBeforeClose = calls;
    await writer.close();

    // 検証
    expect(callsBeforeClose).toBe(0);
    expect(calls).toBe(1);
    expect(storage.read({ key: "k1" })).toStrictEqual(new Uint8Array([1, 2]));
  });

  test("read・exists・getReadable では sizeOf を呼ばない", async ({ expect, signal }) => {
    // 準備
    let calls = 0;
    const storage = new LruCache({
      maxBytes: 10,
      sizeOf: () => {
        calls += 1;
        return 1;
      },
    });
    await storage.open({ signal });
    storage.write({ vars: {}, key: "k1", data: "v1" });
    calls = 0;

    // 実行
    storage.read({ key: "k1" });
    storage.exists({ key: "k1" });
    storage.getReadable({ key: "k1" });

    // 検証
    expect(calls).toBe(0);
  });

  test("delete・clear・ストレージの close では sizeOf を呼ばない", async ({ expect, signal }) => {
    // 準備
    let calls = 0;
    const storage = new LruCache({
      maxBytes: 10,
      sizeOf: () => {
        calls += 1;
        return 1;
      },
    });
    await storage.open({ signal });
    storage.write({ vars: {}, key: "k1", data: "v1" });
    storage.write({ vars: {}, key: "k2", data: "v2" });
    calls = 0;

    // 実行
    storage.delete({ key: "k1" });
    storage.clear();
    await storage.close({ signal });

    // 検証
    expect(calls).toBe(0);
  });

  test("ストリームの close 時に sizeOf が不正値を返したとき、close は拒否され、値は保存されない", async ({
    expect,
    signal,
  }) => {
    // 準備
    const storage = new LruCache({ maxBytes: 10, sizeOf: () => -1 });
    await storage.open({ signal });
    const writer = storage.getWritable({ vars: {}, key: "k1" }).getWriter();
    await writer.write(new Uint8Array([1]));

    // 実行
    const error = await captureRejection(writer.close());

    // 検証
    expect(error).toBeInstanceOf(InvalidSizeOfResultError);
    expect(storage.exists({ key: "k1" })).toBe(false);
  });

  test("ストリームの close 時に sizeOf が不正値を返したとき、既存の値は残る", async ({
    expect,
    signal,
  }) => {
    // 準備
    let bad = false;
    const storage = new LruCache({
      maxBytes: 10,
      sizeOf: () => {
        if (bad) {
          return -1;
        }
        return 1;
      },
    });
    await storage.open({ signal });
    storage.write({ vars: {}, key: "k1", data: "old" });
    bad = true;
    const writer = storage.getWritable({ vars: {}, key: "k1" }).getWriter();
    await writer.write(new Uint8Array([9]));

    // 実行
    await captureRejection(writer.close());

    // 検証
    expect(storage.read({ key: "k1" })).toBe("old");
  });
});
