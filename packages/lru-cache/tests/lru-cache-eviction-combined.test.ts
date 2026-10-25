import type { IStorage } from "@unikvs/core";
import {
  createGetContext,
  createHasContext,
  createSetContext,
  createOpenContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import LruCache from "../src/lru-cache.js";

describe("件数上限と容量上限の併用", () => {
  test("件数上限を先に適用し、容量上限を後に適用する", async ({ expect, signal }) => {
    // 準備：
    const storage = new LruCache({
      sizeOf: (): number => 1,
      maxBytes: 3,
      maxEntries: 2,
    });
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行：
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    storage.write(createSetContext("k2") as IStorage.WriteContext, "v2");
    storage.write(createSetContext("k3") as IStorage.WriteContext, "v3");
    storage.write(createSetContext("k4") as IStorage.WriteContext, "v4");

    // 検証：
    expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(false);
    expect(storage.exists(createHasContext("k2") as IStorage.ExistsContext)).toBe(false);
    expect(storage.read(createGetContext("k3") as IStorage.ReadContext)).toBe("v3");
    expect(storage.read(createGetContext("k4") as IStorage.ReadContext)).toBe("v4");
    expect(storage.size).toBe(2);
    expect(storage.bytes).toBe(2);
  });

  test("容量側の追い出し後も件数上限以内に収まる", async ({ expect, signal }) => {
    // 準備：
    const sizes: Record<string, number> = {
      k1: 1,
      k2: 5,
      k3: 1,
    };
    const storage = new LruCache({
      sizeOf: (_value: unknown, key: string): number => sizes[key] as number,
      maxBytes: 6,
      maxEntries: 3,
    });
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行：
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    storage.write(createSetContext("k2") as IStorage.WriteContext, "v2");
    storage.write(createSetContext("k3") as IStorage.WriteContext, "v3");

    // 検証：
    expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(false);
    expect(storage.read(createGetContext("k2") as IStorage.ReadContext)).toBe("v2");
    expect(storage.read(createGetContext("k3") as IStorage.ReadContext)).toBe("v3");
    expect(storage.size).toBe(2);
    expect(storage.bytes).toBe(6);
  });

  test("maxEntries が 0 のとき、容量側の追い出しは何もしない", async ({ expect, signal }) => {
    // 準備：
    const storage = new LruCache({
      sizeOf: (): number => 4,
      maxBytes: 10,
      maxEntries: 0,
    });
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行：
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");

    // 検証：
    expect(storage.size).toBe(0);
    expect(storage.bytes).toBe(0);
    expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(false);
  });
});
