import type { IStorage } from "@unikvs/core";
import { createGetContext, createHasContext, createSetContext } from "@unikvs/testing";
import { describe, test } from "vitest";

import {
  InvalidMaxEntriesError,
  InvalidNamespaceError,
  InvalidTtlSecondsError,
  KeyNotFoundError,
} from "../src/errors.js";
import VercelRuntimeCache, { DEFAULT_TTL_SECONDS } from "../src/vercel-runtime-cache.js";

describe("オプション検証", () => {
  test("デフォルトの ttlSeconds は 60", ({ expect }) => {
    const storage = new VercelRuntimeCache();

    expect(storage.ttlSeconds).toBe(DEFAULT_TTL_SECONDS);
    expect(storage.backend).toBeUndefined();
  });

  test("不正な ttlSeconds は InvalidTtlSecondsError", ({ expect }) => {
    for (const actual of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, "60"]) {
      expect(() => new VercelRuntimeCache({ ttlSeconds: actual as number })).toThrow(
        InvalidTtlSecondsError,
      );
    }
  });

  test("不正な maxEntries は InvalidMaxEntriesError", ({ expect }) => {
    for (const actual of [-1, 1.5, Number.NaN]) {
      expect(() => new VercelRuntimeCache({ maxEntries: actual as number })).toThrow(
        InvalidMaxEntriesError,
      );
    }
  });

  test("不正な namespace は InvalidNamespaceError", ({ expect }) => {
    expect(() => new VercelRuntimeCache({ namespace: 123 as unknown as string })).toThrow(
      InvalidNamespaceError,
    );
  });

  test("maxEntries を超えたら LRU で追い出す", async ({ expect }) => {
    const storage = new VercelRuntimeCache({ maxEntries: 2 });
    await storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    await storage.write(createSetContext("k2") as IStorage.WriteContext, "v2");
    await storage.read(createGetContext("k1") as IStorage.ReadContext);
    await storage.write(createSetContext("k3") as IStorage.WriteContext, "v3");

    await expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).resolves.toBe(
      true,
    );
    await expect(storage.exists(createHasContext("k2") as IStorage.ExistsContext)).resolves.toBe(
      false,
    );
    await expect(storage.exists(createHasContext("k3") as IStorage.ExistsContext)).resolves.toBe(
      true,
    );
  });

  test("maxEntries: 0 では何も保持しない", async ({ expect }) => {
    const storage = new VercelRuntimeCache({ maxEntries: 0 });
    await storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");

    await expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).resolves.toBe(
      false,
    );
    await expect(
      storage.read(createGetContext("k1") as IStorage.ReadContext),
    ).rejects.toBeInstanceOf(KeyNotFoundError);
  });

  test("clone オプションが使われる", async ({ expect }) => {
    const calls: unknown[] = [];
    const storage = new VercelRuntimeCache({
      clone: <T>(value: T): T => {
        calls.push(value);
        return structuredClone(value);
      },
    });
    await storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    await storage.read(createGetContext("k1") as IStorage.ReadContext);

    expect(calls).toStrictEqual(["v1", "v1"]);
  });
});
