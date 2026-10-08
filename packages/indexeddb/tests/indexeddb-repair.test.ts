import { RepairNotAllowedError } from "@unikvs/core";
import { describe } from "vitest";

import Indexeddb from "../src/indexeddb.js";
import { STORE_NAME, test } from "./_helpers.js";

const { signal } = new AbortController();

describe("Indexeddb - 書き戻しの許可", () => {
  test("既定では書き戻しを拒否する", async ({ expect, dbName }) => {
    // 準備
    const storage = new Indexeddb(dbName, STORE_NAME);
    await storage.open({ signal });

    try {
      // 実行
      const error = await storage
        .write({ key: "a", data: "x", signal, vars: { "unikvs:repair": true } })
        .catch((ex: unknown) => ex);

      // 検証
      expect(storage.allowRepair).toBe(false);
      expect(error).toBeInstanceOf(RepairNotAllowedError);
      expect(await storage.exists({ key: "a", signal })).toBe(false);
    } finally {
      if (storage.isOpen) {
        await storage.close({ signal });
      }
    }
  });

  test("allowRepair: true では書き戻しを受け付ける", async ({ expect, dbName }) => {
    // 準備
    const storage = new Indexeddb(dbName, STORE_NAME, { allowRepair: true });
    await storage.open({ signal });

    try {
      // 実行と検証
      expect(storage.allowRepair).toBe(true);
      await storage.write({ key: "a", data: "x", signal, vars: { "unikvs:repair": true } });
      expect(await storage.read({ key: "a", signal })).toBe("x");
    } finally {
      if (storage.isOpen) {
        await storage.close({ signal });
      }
    }
  });

  test("allowRepair: false では書き戻しの write を拒否する", async ({ expect, dbName }) => {
    // 準備
    const storage = new Indexeddb(dbName, STORE_NAME, { allowRepair: false });
    await storage.open({ signal });

    try {
      // 実行
      const error = await storage
        .write({ key: "a", data: "x", signal, vars: { "unikvs:repair": true } })
        .catch((ex: unknown) => ex);

      // 検証
      expect(storage.allowRepair).toBe(false);
      expect(error).toBeInstanceOf(RepairNotAllowedError);
      expect(await storage.exists({ key: "a", signal })).toBe(false);
    } finally {
      if (storage.isOpen) {
        await storage.close({ signal });
      }
    }
  });

  test("allowRepair: false でも通常の write は受け付ける", async ({ expect, dbName }) => {
    // 準備
    const storage = new Indexeddb(dbName, STORE_NAME, { allowRepair: false });
    await storage.open({ signal });

    try {
      // 実行と検証: 目印なしの書き込みは影響を受けない
      await storage.write({ key: "a", data: "x", signal, vars: {} });
      await storage.write({ key: "b", data: "y", signal, vars: {} });
      expect(await storage.read({ key: "a", signal })).toBe("x");
      expect(await storage.read({ key: "b", signal })).toBe("y");
    } finally {
      if (storage.isOpen) {
        await storage.close({ signal });
      }
    }
  });

  test("allowRepair: false では書き戻しの getWritable を拒否する", async ({ expect, dbName }) => {
    // 準備
    const storage = new Indexeddb(dbName, STORE_NAME, { allowRepair: false });
    await storage.open({ signal });

    try {
      // 実行と検証
      expect(() =>
        storage.getWritable({ key: "a", signal, vars: { "unikvs:repair": true } }),
      ).toThrow(RepairNotAllowedError);
      expect(await storage.exists({ key: "a", signal })).toBe(false);
    } finally {
      if (storage.isOpen) {
        await storage.close({ signal });
      }
    }
  });

  test("書き戻しを許可した getWritable は通常どおり書き込める", async ({ expect, dbName }) => {
    // 準備
    const storage = new Indexeddb(dbName, STORE_NAME, { allowRepair: true });
    await storage.open({ signal });

    try {
      // 実行
      const writable = storage.getWritable({
        key: "a",
        signal,
        vars: { "unikvs:repair": true },
      });
      const writer = writable.getWriter();
      await writer.write(new Uint8Array([1, 2, 3]));
      await writer.close();

      // 検証
      expect(await storage.exists({ key: "a", signal })).toBe(true);
      expect(await storage.read({ key: "a", signal })).toStrictEqual(new Uint8Array([1, 2, 3]));
    } finally {
      if (storage.isOpen) {
        await storage.close({ signal });
      }
    }
  });
});
