import { RepairNotAllowedError } from "@unikvs/core";
import { describe } from "vitest";

import Redis from "../src/redis.js";
import { randomKeyPrefix, test } from "./_helpers.js";

describe("Redis - 書き戻しの許可", () => {
  test("既定では書き戻しを拒否する", async ({ expect, signal, storage }) => {
    // 準備
    // storage フィクスチャーは既定のオプションで開かれている。

    // 実行と検証
    expect(storage.allowRepair).toBe(false);
    await expect(
      storage.write({
        key: "a",
        data: new Uint8Array([1]),
        signal,
        vars: { "unikvs:repair": true },
      }),
    ).rejects.toThrow(RepairNotAllowedError);
    await expect(storage.exists({ key: "a", signal })).resolves.toBe(false);
  });

  test("allowRepair: true では書き戻しを受け付ける", async ({ expect, signal, url }) => {
    // 準備
    const storage = new Redis(url, { keyPrefix: randomKeyPrefix(), allowRepair: true });
    await storage.open();

    try {
      // 実行と検証
      expect(storage.allowRepair).toBe(true);
      await storage.write({
        key: "a",
        data: new Uint8Array([1]),
        signal,
        vars: { "unikvs:repair": true },
      });
      await expect(storage.read({ key: "a", signal })).resolves.toStrictEqual(new Uint8Array([1]));
    } finally {
      if (storage.isOpen) {
        await storage.close();
      }
    }
  });

  test("allowRepair: false では書き戻しの write を拒否する", async ({ expect, signal, url }) => {
    // 準備
    const storage = new Redis(url, { keyPrefix: randomKeyPrefix(), allowRepair: false });
    await storage.open();

    try {
      // 実行と検証
      expect(storage.allowRepair).toBe(false);
      await expect(
        storage.write({
          key: "a",
          data: new Uint8Array([1]),
          signal,
          vars: { "unikvs:repair": true },
        }),
      ).rejects.toThrow(RepairNotAllowedError);
      await expect(storage.exists({ key: "a", signal })).resolves.toBe(false);
    } finally {
      if (storage.isOpen) {
        await storage.close();
      }
    }
  });

  test("allowRepair: false でも通常の write は受け付ける", async ({ expect, signal, url }) => {
    // 準備
    const storage = new Redis(url, { keyPrefix: randomKeyPrefix(), allowRepair: false });
    await storage.open();

    try {
      // 実行: 目印なしの書き込みは影響を受けない
      await storage.write({ key: "a", data: new Uint8Array([1]), signal, vars: {} });
      await storage.write({ key: "b", data: new Uint8Array([2]), signal, vars: {} });

      // 検証
      await expect(storage.read({ key: "a", signal })).resolves.toStrictEqual(new Uint8Array([1]));
      await expect(storage.read({ key: "b", signal })).resolves.toStrictEqual(new Uint8Array([2]));
    } finally {
      if (storage.isOpen) {
        await storage.close();
      }
    }
  });

  test("allowRepair: false では書き戻しの getWritable を拒否する", async ({
    expect,
    signal,
    url,
  }) => {
    // 準備
    const storage = new Redis(url, { keyPrefix: randomKeyPrefix(), allowRepair: false });
    await storage.open();

    try {
      // 実行と検証
      expect(() =>
        storage.getWritable({ key: "a", signal, vars: { "unikvs:repair": true } }),
      ).toThrow(RepairNotAllowedError);
      await expect(storage.exists({ key: "a", signal })).resolves.toBe(false);
    } finally {
      if (storage.isOpen) {
        await storage.close();
      }
    }
  });

  test("書き戻しを許可した getWritable は通常どおり書き込める", async ({ expect, signal, url }) => {
    // 準備
    const storage = new Redis(url, { keyPrefix: randomKeyPrefix(), allowRepair: true });
    await storage.open();

    try {
      // 実行
      const writable = storage.getWritable({ key: "a", signal, vars: { "unikvs:repair": true } });
      const writer = writable.getWriter();
      await writer.write(new Uint8Array([1, 2, 3]));
      await writer.close();

      // 検証
      await expect(storage.exists({ key: "a", signal })).resolves.toBe(true);
      await expect(storage.read({ key: "a", signal })).resolves.toStrictEqual(
        new Uint8Array([1, 2, 3]),
      );
    } finally {
      if (storage.isOpen) {
        await storage.close();
      }
    }
  });
});
