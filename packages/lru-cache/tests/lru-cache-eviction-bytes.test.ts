import { describe, test as vitest } from "vitest";

import LruCache from "../src/lru-cache.js";

/**
 * バイト数を固定する sizeOf です。
 * 容量上限の追い出し境界を決定論的に検証するために使用します。
 */
function fixedSizeOf(size: number): (value: any, key: string) => number {
  return () => size;
}

/**
 * テストごとに容量上限付きの LruCache インスタンスを提供します。
 * 容量上限による追い出しの振る舞いを検証するために使用します。
 */
const test = vitest.extend<{ storage: LruCache }>({
  // oxlint-disable-next-line no-empty-pattern
  async storage({}, use) {
    const storage = new LruCache({ maxBytes: 3, sizeOf: fixedSizeOf(1) });
    await storage.open({ signal: new AbortController().signal });
    await use(storage);
  },
});

describe("容量上限による追い出し", () => {
  test("上限を超えたとき、最も古いものから追い出される", ({ expect, storage }) => {
    // 準備と実行
    storage.write({ vars: {}, key: "k1", data: "v1" });
    storage.write({ vars: {}, key: "k2", data: "v2" });
    storage.write({ vars: {}, key: "k3", data: "v3" });
    storage.write({ vars: {}, key: "k4", data: "v4" });

    // 検証
    expect(storage.exists({ key: "k1" })).toBe(false);
    expect(storage.read({ key: "k2" })).toBe("v2");
    expect(storage.bytes).toBe(3);
    expect(storage.size).toBe(3);
  });

  test("既定の sizeOf は Uint8Array を byteLength で数える", async ({ expect, signal }) => {
    // 準備
    const storage = new LruCache({ maxBytes: 4 });
    await storage.open({ signal });

    // 実行
    storage.write({ vars: {}, key: "k1", data: new Uint8Array([1, 2, 3]) });
    storage.write({ vars: {}, key: "k2", data: new Uint8Array([4]) });

    // 検証
    expect(storage.bytes).toBe(4);
    expect(storage.size).toBe(2);
  });

  test("既定の sizeOf はバイト列以外を 1 として数える", async ({ expect, signal }) => {
    // 準備
    const storage = new LruCache({ maxBytes: 2 });
    await storage.open({ signal });

    // 実行
    storage.write({ vars: {}, key: "k1", data: "hello" });
    storage.write({ vars: {}, key: "k2", data: { a: 1 } });

    // 検証
    expect(storage.bytes).toBe(2);
    expect(storage.size).toBe(2);
  });

  test("カスタムの sizeOf で追い出し量が決まる", async ({ expect, signal }) => {
    // 準備
    const storage = new LruCache({ maxBytes: 10, sizeOf: () => 6 });
    await storage.open({ signal });

    // 実行
    storage.write({ vars: {}, key: "k1", data: "v1" });
    storage.write({ vars: {}, key: "k2", data: "v2" });

    // 検証
    expect(storage.exists({ key: "k1" })).toBe(false);
    expect(storage.read({ key: "k2" })).toBe("v2");
    expect(storage.bytes).toBe(6);
  });

  test("maxBytes 未設定時の bytes は常に 0 である", async ({ expect, signal }) => {
    // 準備
    const storage = new LruCache();
    await storage.open({ signal });

    // 実行
    storage.write({ vars: {}, key: "k1", data: new Uint8Array([1, 2, 3]) });

    // 検証
    expect(storage.bytes).toBe(0);
    expect(storage.size).toBe(1);
  });

  test("上書きしたとき、古いバイト数は差し引かれる", async ({ expect, signal }) => {
    // 準備
    const storage = new LruCache({ maxBytes: 10, sizeOf: (value) => (value as string).length });
    await storage.open({ signal });

    // 実行
    storage.write({ vars: {}, key: "k1", data: "ab" });
    storage.write({ vars: {}, key: "k1", data: "abcde" });

    // 検証
    expect(storage.bytes).toBe(5);
    expect(storage.read({ key: "k1" })).toBe("abcde");
  });

  test("delete したとき、バイト数は差し引かれる", async ({ expect, signal }) => {
    // 準備
    const storage = new LruCache({ maxBytes: 10, sizeOf: fixedSizeOf(4) });
    await storage.open({ signal });
    storage.write({ vars: {}, key: "k1", data: "v1" });

    // 実行
    storage.delete({ key: "k1" });

    // 検証
    expect(storage.bytes).toBe(0);
    expect(storage.size).toBe(0);
  });

  test("clear したとき、バイト数は 0 に戻る", async ({ expect, signal }) => {
    // 準備
    const storage = new LruCache({ maxBytes: 10, sizeOf: fixedSizeOf(4) });
    await storage.open({ signal });
    storage.write({ vars: {}, key: "k1", data: "v1" });

    // 実行
    storage.clear();

    // 検証
    expect(storage.bytes).toBe(0);
    expect(storage.size).toBe(0);
  });
});

describe("単独で上限を超えた値の保持", () => {
  test("単独で上限を超える新規エントリーは保持される", async ({ expect, signal }) => {
    // 準備
    const storage = new LruCache({ maxBytes: 5, sizeOf: () => 10 });
    await storage.open({ signal });

    // 実行
    storage.write({ vars: {}, key: "big", data: "v" });

    // 検証
    expect(storage.read({ key: "big" })).toBe("v");
    expect(storage.bytes).toBe(10);
  });

  test("上限を超えた単独のキーは後続の書き込みで追い出される", async ({ expect, signal }) => {
    // 準備
    const storage = new LruCache({ maxBytes: 5, sizeOf: () => 10 });
    await storage.open({ signal });
    storage.write({ vars: {}, key: "big", data: "v1" });

    // 実行
    storage.write({ vars: {}, key: "small", data: "v2" });

    // 検証
    expect(storage.exists({ key: "big" })).toBe(false);
    expect(storage.read({ key: "small" })).toBe("v2");
  });

  test("maxBytes が 0 でも空でない値は保持される", async ({ expect, signal }) => {
    // 準備
    const storage = new LruCache({ maxBytes: 0, sizeOf: () => 1 });
    await storage.open({ signal });

    // 実行
    storage.write({ vars: {}, key: "k1", data: "v1" });

    // 検証
    expect(storage.read({ key: "k1" })).toBe("v1");
  });

  test("maxBytes が 0 のとき、空の Uint8Array は追い出されずに蓄積する", async ({
    expect,
    signal,
  }) => {
    // 準備
    const storage = new LruCache({ maxBytes: 0 });
    await storage.open({ signal });

    // 実行
    storage.write({ vars: {}, key: "k1", data: new Uint8Array(0) });
    storage.write({ vars: {}, key: "k2", data: new Uint8Array(0) });

    // 検証
    expect(storage.size).toBe(2);
    expect(storage.bytes).toBe(0);
    expect(storage.read({ key: "k1" })).toStrictEqual(new Uint8Array(0));
    expect(storage.read({ key: "k2" })).toStrictEqual(new Uint8Array(0));
  });
});
