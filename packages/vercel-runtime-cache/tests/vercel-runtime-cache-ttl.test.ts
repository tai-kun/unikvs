import type { IStorage } from "@unikvs/core";
import {
  createGetContext,
  createHasContext,
  createSetContext,
  createDeleteContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import { KeyNotFoundError } from "../src/errors.js";
import VercelRuntimeCache from "../src/vercel-runtime-cache.js";
import { createFakeRuntimeCache } from "./_helpers.js";

describe("TTL による遅延失効", () => {
  test("TTL を過ぎた read は KeyNotFoundError を投げる", async ({ expect }) => {
    let now = 1000;
    const storage = new VercelRuntimeCache({
      now: (): number => now,
      ttlSeconds: 60,
    });
    await storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    now += 61_000;
    await expect(
      storage.read(createGetContext("k1") as IStorage.ReadContext),
    ).rejects.toBeInstanceOf(KeyNotFoundError);
  });

  test("TTL を過ぎた exists は false を返し、read も失敗する", async ({ expect }) => {
    let now = 0;
    const storage = new VercelRuntimeCache({
      now: (): number => now,
      ttlSeconds: 10,
    });
    await storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    now += 11_000;
    await expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).resolves.toBe(
      false,
    );
    await expect(
      storage.read(createGetContext("k1") as IStorage.ReadContext),
    ).rejects.toBeInstanceOf(KeyNotFoundError);
  });

  test("TTL を過ぎた delete は KeyNotFoundError を投げる", async ({ expect }) => {
    let now = 0;
    const storage = new VercelRuntimeCache({
      now: (): number => now,
      ttlSeconds: 10,
    });
    await storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    now += 10_001;
    await expect(
      storage.delete(createDeleteContext("k1") as IStorage.DeleteContext),
    ).rejects.toBeInstanceOf(KeyNotFoundError);
  });

  test("TTL 前の read は成功する", async ({ expect }) => {
    let now = 0;
    const storage = new VercelRuntimeCache({
      now: (): number => now,
      ttlSeconds: 60,
    });
    await storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    now += 59_999;
    await expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).resolves.toBe("v1");
  });

  test("再書き込みで TTL が更新される", async ({ expect }) => {
    let now = 0;
    const storage = new VercelRuntimeCache({
      now: (): number => now,
      ttlSeconds: 10,
    });
    await storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    now += 9000;
    await storage.write(createSetContext("k1") as IStorage.WriteContext, "v2");
    now += 9000;
    await expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).resolves.toBe("v2");
  });

  test("期限切れエントリは size に数えられない", async ({ expect }) => {
    let now = 0;
    const storage = new VercelRuntimeCache({
      now: (): number => now,
      ttlSeconds: 10,
    });
    await storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    expect(storage.size).toBe(1);
    now += 11_000;
    expect(storage.size).toBe(0);
  });

  test("バックエンド側でも TTL 失効し、期限切れエントリは削除される", async ({ expect }) => {
    let now = 0;
    const backend = createFakeRuntimeCache();
    const storage = new VercelRuntimeCache({
      now: (): number => now,
      backend,
      ttlSeconds: 10,
    });
    await storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    now += 11_000;
    await expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).resolves.toBe(
      false,
    );
    expect(backend.store.has("k1")).toBe(false);
    await expect(
      storage.read(createGetContext("k1") as IStorage.ReadContext),
    ).rejects.toBeInstanceOf(KeyNotFoundError);
  });
});
