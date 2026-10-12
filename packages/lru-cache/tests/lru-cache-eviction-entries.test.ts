import { describe, test as vitest } from "vitest";

import { KeyNotFoundError } from "../src/errors.js";
import LruCache from "../src/lru-cache.js";

/**
 * テストごとに件数上限付きの LruCache インスタンスを提供します。
 * 件数上限による追い出しの振る舞いを検証するために使用します。
 */
const test = vitest.extend<{ storage: LruCache }>({
  // oxlint-disable-next-line no-empty-pattern
  async storage({}, use) {
    const storage = new LruCache({ maxEntries: 2 });
    await storage.open({ signal: new AbortController().signal });
    await use(storage);
  },
});

describe("件数上限による追い出し", () => {
  test("上限を超えたとき、最も古いものから追い出される", ({ expect, storage }) => {
    // 準備と実行
    storage.write({ vars: {}, key: "k1", data: "v1" });
    storage.write({ vars: {}, key: "k2", data: "v2" });
    storage.write({ vars: {}, key: "k3", data: "v3" });

    // 検証
    expect(storage.exists({ key: "k1" })).toBe(false);
    expect(storage.read({ key: "k2" })).toBe("v2");
    expect(storage.read({ key: "k3" })).toBe("v3");
    expect(storage.size).toBe(2);
  });

  test("read のヒット時は追い出し対象から除外される", ({ expect, storage }) => {
    // 準備
    storage.write({ vars: {}, key: "k1", data: "v1" });
    storage.write({ vars: {}, key: "k2", data: "v2" });
    storage.read({ key: "k1" });

    // 実行
    storage.write({ vars: {}, key: "k3", data: "v3" });

    // 検証
    expect(storage.exists({ key: "k2" })).toBe(false);
    expect(storage.read({ key: "k1" })).toBe("v1");
    expect(storage.read({ key: "k3" })).toBe("v3");
  });

  test("上書きしたキーは最も新しいものとして扱われる", ({ expect, storage }) => {
    // 準備
    storage.write({ vars: {}, key: "k1", data: "v1" });
    storage.write({ vars: {}, key: "k2", data: "v2" });
    storage.write({ vars: {}, key: "k1", data: "v1-updated" });

    // 実行
    storage.write({ vars: {}, key: "k3", data: "v3" });

    // 検証
    expect(storage.exists({ key: "k2" })).toBe(false);
    expect(storage.read({ key: "k1" })).toBe("v1-updated");
    expect(storage.read({ key: "k3" })).toBe("v3");
  });

  test("exists は直近使用順を更新しない", ({ expect, storage }) => {
    // 準備
    storage.write({ vars: {}, key: "k1", data: "v1" });
    storage.write({ vars: {}, key: "k2", data: "v2" });
    storage.exists({ key: "k1" });

    // 実行
    storage.write({ vars: {}, key: "k3", data: "v3" });

    // 検証
    expect(storage.exists({ key: "k1" })).toBe(false);
    expect(storage.read({ key: "k2" })).toBe("v2");
    expect(storage.read({ key: "k3" })).toBe("v3");
  });

  test("delete した分だけ追い出しが遅れる", ({ expect, storage }) => {
    // 準備
    storage.write({ vars: {}, key: "k1", data: "v1" });
    storage.write({ vars: {}, key: "k2", data: "v2" });
    storage.delete({ key: "k1" });

    // 実行
    storage.write({ vars: {}, key: "k3", data: "v3" });

    // 検証
    expect(storage.size).toBe(2);
    expect(storage.read({ key: "k2" })).toBe("v2");
    expect(storage.read({ key: "k3" })).toBe("v3");
  });

  test("上限なしでは memory と等価にすべて保持される", async ({ expect, signal }) => {
    // 準備
    const unbounded = new LruCache();
    await unbounded.open({ signal });

    // 実行
    for (let i = 0; i < 100; i += 1) {
      unbounded.write({ vars: {}, key: `k${i}`, data: `v${i}` });
    }

    // 検証
    expect(unbounded.size).toBe(100);
    expect(unbounded.read({ key: "k0" })).toBe("v0");
    expect(unbounded.read({ key: "k99" })).toBe("v99");
  });
});

describe("maxEntries が 0 のとき", () => {
  test("書き込みは受理するが直ちに追い出され、size は 0 のままである", async ({
    expect,
    signal,
  }) => {
    // 準備
    const storage = new LruCache({ maxEntries: 0 });
    await storage.open({ signal });

    // 実行
    storage.write({ vars: {}, key: "k1", data: "v1" });

    // 検証
    expect(storage.size).toBe(0);
    expect(storage.exists({ key: "k1" })).toBe(false);
    expect(() => storage.read({ key: "k1" })).toThrow(KeyNotFoundError);
  });

  test("繰り返し書き込んでも記録が壊れず、size は 0 のままである", async ({ expect, signal }) => {
    // 準備
    const storage = new LruCache({ maxEntries: 0 });
    await storage.open({ signal });

    // 実行
    storage.write({ vars: {}, key: "k1", data: "v1" });
    storage.write({ vars: {}, key: "k2", data: "v2" });

    // 検証
    expect(storage.size).toBe(0);
    expect(storage.exists({ key: "k1" })).toBe(false);
    expect(storage.exists({ key: "k2" })).toBe(false);
  });
});
