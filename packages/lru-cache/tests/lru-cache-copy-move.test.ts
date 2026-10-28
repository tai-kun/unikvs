import type { IStorage } from "@unikvs/core";
import {
  createGetContext,
  createHasContext,
  createSetContext,
  createCopyContext,
  createMoveContext,
  createOpenContext,
} from "@unikvs/testing";
import { test as vitest, describe } from "vite-plus/test";

import { KeyNotFoundError, InvalidSizeOfResultError } from "../src/errors.js";
import LruCache from "../src/lru-cache.js";

/**
 * テストごとに open 済みの LruCache インスタンスを提供します。
 * コピーと移動の振る舞いを検証するために使用します。
 */
const test = vitest.extend<{ storage: LruCache }>({
  async storage({}, use) {
    const storage = new LruCache();
    await storage.open(createOpenContext() as IStorage.OpenContext);
    await use(storage);
  },
});
describe("コピー", () => {
  test("コピー元を残したままコピー先へ値を複製する", ({ expect, storage }) => {
    // 準備：
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");

    // 実行：
    storage.copy(createCopyContext("k1", "k2") as IStorage.CopyContext);

    // 検証：
    expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).toBe("v1");
    expect(storage.read(createGetContext("k2") as IStorage.ReadContext)).toBe("v1");
    expect(storage.size).toBe(2);
  });

  test("コピー先の既存値を上書きする", ({ expect, storage }) => {
    // 準備：
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    storage.write(createSetContext("k2") as IStorage.WriteContext, "old");

    // 実行：
    storage.copy(createCopyContext("k1", "k2") as IStorage.CopyContext);

    // 検証：
    expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).toBe("v1");
    expect(storage.read(createGetContext("k2") as IStorage.ReadContext)).toBe("v1");
    expect(storage.size).toBe(2);
  });

  test("存在しないキーの copy は KeyNotFoundError を投げる", ({ expect, storage }) => {
    // 実行と検証：
    expect(() => {
      storage.copy(createCopyContext("unknown", "k2") as IStorage.CopyContext);
    }).toThrow(KeyNotFoundError);
  });

  test("同じキーへの copy は値を削除せず成功する", ({ expect, storage }) => {
    // 準備：
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");

    // 実行：
    storage.copy(createCopyContext("k1", "k1") as IStorage.CopyContext);

    // 検証：
    expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).toBe("v1");
  });

  test("コピー元を直近使用として扱う", async ({ expect }) => {
    // 準備：
    const storage = new LruCache({ maxEntries: 2 });
    await storage.open(createOpenContext() as IStorage.OpenContext);
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    storage.write(createSetContext("k2") as IStorage.WriteContext, "v2");

    // 実行：
    storage.copy(createCopyContext("k1", "k3") as IStorage.CopyContext);

    // 検証：
    expect(storage.exists(createHasContext("k2") as IStorage.ExistsContext)).toBe(false);
    expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).toBe("v1");
    expect(storage.read(createGetContext("k3") as IStorage.ReadContext)).toBe("v1");
  });

  test("copy はコピー先のバイト数を加算する", async ({ expect }) => {
    // 準備：
    const storage = new LruCache({ maxBytes: 16 });
    await storage.open(createOpenContext() as IStorage.OpenContext);
    storage.write(createSetContext("k1") as IStorage.WriteContext, new Uint8Array(4));

    // 実行：
    storage.copy(createCopyContext("k1", "k2") as IStorage.CopyContext);

    // 検証：
    expect(storage.size).toBe(2);
    expect(storage.bytes).toBe(8);
  });
});
describe("移動", () => {
  test("移動先へ値を移し移動元を削除する", ({ expect, storage }) => {
    // 準備：
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");

    // 実行：
    storage.move(createMoveContext("k1", "k2") as IStorage.MoveContext);

    // 検証：
    expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(false);
    expect(storage.read(createGetContext("k2") as IStorage.ReadContext)).toBe("v1");
    expect(storage.size).toBe(1);
  });

  test("移動先の既存値を上書きする", ({ expect, storage }) => {
    // 準備：
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    storage.write(createSetContext("k2") as IStorage.WriteContext, "old");

    // 実行：
    storage.move(createMoveContext("k1", "k2") as IStorage.MoveContext);

    // 検証：
    expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(false);
    expect(storage.read(createGetContext("k2") as IStorage.ReadContext)).toBe("v1");
    expect(storage.size).toBe(1);
  });

  test("存在しないキーの move は KeyNotFoundError を投げる", ({ expect, storage }) => {
    // 実行と検証：
    expect(() => {
      storage.move(createMoveContext("unknown", "k2") as IStorage.MoveContext);
    }).toThrow(KeyNotFoundError);
  });

  test("同じキーへの move は値を削除せず成功する", ({ expect, storage }) => {
    // 準備：
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");

    // 実行：
    storage.move(createMoveContext("k1", "k1") as IStorage.MoveContext);

    // 検証：
    expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).toBe("v1");
  });

  test("移動先への書き込みが失敗したとき移動元を残す", async ({ expect }) => {
    // 準備：
    const sizes: Record<string, number> = {
      k1: 1,
      k2: Number.NaN,
    };
    const storage = new LruCache({
      sizeOf: (_value: unknown, key: string): number => sizes[key] as number,
      maxBytes: 10,
    });
    await storage.open(createOpenContext() as IStorage.OpenContext);
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");

    // 実行と検証：
    expect(() => {
      storage.move(createMoveContext("k1", "k2") as IStorage.MoveContext);
    }).toThrow(InvalidSizeOfResultError);
    expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).toBe("v1");
    expect(storage.exists(createHasContext("k2") as IStorage.ExistsContext)).toBe(false);
  });

  test("move はバイト数を維持する", async ({ expect }) => {
    // 準備：
    const storage = new LruCache({ maxBytes: 16 });
    await storage.open(createOpenContext() as IStorage.OpenContext);
    storage.write(createSetContext("k1") as IStorage.WriteContext, new Uint8Array(4));

    // 実行：
    storage.move(createMoveContext("k1", "k2") as IStorage.MoveContext);

    // 検証：
    expect(storage.size).toBe(1);
    expect(storage.bytes).toBe(4);
    expect(storage.read(createGetContext("k2") as IStorage.ReadContext)).toEqual(new Uint8Array(4));
  });
});
