import { describe, test } from "vitest";

import LruCache from "../src/lru-cache.js";

describe("件数上限と容量上限の併用", () => {
  test("件数上限を先に適用し、容量上限を後に適用する", async ({ expect, signal }) => {
    // 準備
    const storage = new LruCache({ maxEntries: 2, maxBytes: 3, sizeOf: () => 1 });
    await storage.open({ signal });

    // 実行
    storage.write({ vars: {}, key: "k1", data: "v1" });
    storage.write({ vars: {}, key: "k2", data: "v2" });
    storage.write({ vars: {}, key: "k3", data: "v3" });
    storage.write({ vars: {}, key: "k4", data: "v4" });

    // 検証
    expect(storage.exists({ key: "k1" })).toBe(false);
    expect(storage.exists({ key: "k2" })).toBe(false);
    expect(storage.read({ key: "k3" })).toBe("v3");
    expect(storage.read({ key: "k4" })).toBe("v4");
    expect(storage.size).toBe(2);
    expect(storage.bytes).toBe(2);
  });

  test("容量側の追い出し後も件数上限以内に収まる", async ({ expect, signal }) => {
    // 準備
    const sizes: Record<string, number> = { k1: 1, k2: 5, k3: 1 };
    const storage = new LruCache({
      maxEntries: 3,
      maxBytes: 6,
      sizeOf: (_value, key) => sizes[key]!,
    });
    await storage.open({ signal });

    // 実行
    storage.write({ vars: {}, key: "k1", data: "v1" });
    storage.write({ vars: {}, key: "k2", data: "v2" });
    storage.write({ vars: {}, key: "k3", data: "v3" });

    // 検証
    expect(storage.exists({ key: "k1" })).toBe(false);
    expect(storage.read({ key: "k2" })).toBe("v2");
    expect(storage.read({ key: "k3" })).toBe("v3");
    expect(storage.size).toBe(2);
    expect(storage.bytes).toBe(6);
  });

  test("maxEntries が 0 のとき、容量側の追い出しは何もしない", async ({ expect, signal }) => {
    // 準備
    const storage = new LruCache({ maxEntries: 0, maxBytes: 10, sizeOf: () => 4 });
    await storage.open({ signal });

    // 実行
    storage.write({ vars: {}, key: "k1", data: "v1" });

    // 検証
    expect(storage.size).toBe(0);
    expect(storage.bytes).toBe(0);
    expect(storage.exists({ key: "k1" })).toBe(false);
  });
});
