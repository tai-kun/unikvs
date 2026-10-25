import type { IStorage } from "@unikvs/core";
import {
  createGetContext,
  createHasContext,
  createSetContext,
  createOpenContext,
  createClearContext,
  createDeleteContext,
} from "@unikvs/testing";
import { test as vitest, describe } from "vite-plus/test";

import LruCache from "../src/lru-cache.js";

/**
 * バイト数を固定する sizeOf です。
 * 容量上限の追い出し境界を決定論的に検証するために使用します。
 */
function fixedSizeOf(size: number): (value: any, key: string) => number {
  return (): number => size;
}

/**
 * テストごとに容量上限付きの LruCache インスタンスを提供します。
 * 容量上限による追い出しの振る舞いを検証するために使用します。
 */
const test = vitest.extend<{ storage: LruCache }>({
  async storage({}, use) {
    const storage = new LruCache({
      sizeOf: fixedSizeOf(1),
      maxBytes: 3,
    });
    await storage.open(createOpenContext() as IStorage.OpenContext);
    await use(storage);
  },
});
describe("容量上限による追い出し", () => {
  test("上限を超えたとき、最も古いものから追い出される", ({ expect, storage }) => {
    // 準備と実行：
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    storage.write(createSetContext("k2") as IStorage.WriteContext, "v2");
    storage.write(createSetContext("k3") as IStorage.WriteContext, "v3");
    storage.write(createSetContext("k4") as IStorage.WriteContext, "v4");

    // 検証：
    expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(false);
    expect(storage.read(createGetContext("k2") as IStorage.ReadContext)).toBe("v2");
    expect(storage.bytes).toBe(3);
    expect(storage.size).toBe(3);
  });

  test("既定の sizeOf は Uint8Array を byteLength で数える", async ({ expect, signal }) => {
    // 準備：
    const storage = new LruCache({ maxBytes: 4 });
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行：
    storage.write(createSetContext("k1") as IStorage.WriteContext, new Uint8Array([1, 2, 3]));
    storage.write(createSetContext("k2") as IStorage.WriteContext, new Uint8Array([4]));

    // 検証：
    expect(storage.bytes).toBe(4);
    expect(storage.size).toBe(2);
  });

  test("既定の sizeOf はバイト列以外を 1 として数える", async ({ expect, signal }) => {
    // 準備：
    const storage = new LruCache({ maxBytes: 2 });
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行：
    storage.write(createSetContext("k1") as IStorage.WriteContext, "hello");
    storage.write(createSetContext("k2") as IStorage.WriteContext, { a: 1 });

    // 検証：
    expect(storage.bytes).toBe(2);
    expect(storage.size).toBe(2);
  });

  test("カスタムの sizeOf で追い出し量が決まる", async ({ expect, signal }) => {
    // 準備：
    const storage = new LruCache({
      sizeOf: (): number => 6,
      maxBytes: 10,
    });
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行：
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    storage.write(createSetContext("k2") as IStorage.WriteContext, "v2");

    // 検証：
    expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(false);
    expect(storage.read(createGetContext("k2") as IStorage.ReadContext)).toBe("v2");
    expect(storage.bytes).toBe(6);
  });

  test("maxBytes 未設定時の bytes は常に 0 である", async ({ expect, signal }) => {
    // 準備：
    const storage = new LruCache();
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行：
    storage.write(createSetContext("k1") as IStorage.WriteContext, new Uint8Array([1, 2, 3]));

    // 検証：
    expect(storage.bytes).toBe(0);
    expect(storage.size).toBe(1);
  });

  test("上書きしたとき、古いバイト数は差し引かれる", async ({ expect, signal }) => {
    // 準備：
    const storage = new LruCache({
      sizeOf: (value: unknown): number => (value as string).length,
      maxBytes: 10,
    });
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行：
    storage.write(createSetContext("k1") as IStorage.WriteContext, "ab");
    storage.write(createSetContext("k1") as IStorage.WriteContext, "abcde");

    // 検証：
    expect(storage.bytes).toBe(5);
    expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).toBe("abcde");
  });

  test("delete したとき、バイト数は差し引かれる", async ({ expect, signal }) => {
    // 準備：
    const storage = new LruCache({
      sizeOf: fixedSizeOf(4),
      maxBytes: 10,
    });
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");

    // 実行：
    storage.delete(createDeleteContext("k1") as IStorage.DeleteContext);

    // 検証：
    expect(storage.bytes).toBe(0);
    expect(storage.size).toBe(0);
  });

  test("clear したとき、バイト数は 0 に戻る", async ({ expect, signal }) => {
    // 準備：
    const storage = new LruCache({
      sizeOf: fixedSizeOf(4),
      maxBytes: 10,
    });
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");

    // 実行：
    storage.clear(createClearContext() as IStorage.ClearContext);

    // 検証：
    expect(storage.bytes).toBe(0);
    expect(storage.size).toBe(0);
  });
});
describe("単独で上限を超えた値の保持", () => {
  test("単独で上限を超える新規エントリーは保持される", async ({ expect, signal }) => {
    // 準備：
    const storage = new LruCache({
      sizeOf: (): number => 10,
      maxBytes: 5,
    });
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行：
    storage.write(createSetContext("big") as IStorage.WriteContext, "v");

    // 検証：
    expect(storage.read(createGetContext("big") as IStorage.ReadContext)).toBe("v");
    expect(storage.bytes).toBe(10);
  });

  test("上限を超えた単独のキーは後続の書き込みで追い出される", async ({ expect, signal }) => {
    // 準備：
    const storage = new LruCache({
      sizeOf: (): number => 10,
      maxBytes: 5,
    });
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    storage.write(createSetContext("big") as IStorage.WriteContext, "v1");

    // 実行：
    storage.write(createSetContext("small") as IStorage.WriteContext, "v2");

    // 検証：
    expect(storage.exists(createHasContext("big") as IStorage.ExistsContext)).toBe(false);
    expect(storage.read(createGetContext("small") as IStorage.ReadContext)).toBe("v2");
  });

  test("maxBytes が 0 でも空でない値は保持される", async ({ expect, signal }) => {
    // 準備：
    const storage = new LruCache({
      sizeOf: (): number => 1,
      maxBytes: 0,
    });
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行：
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");

    // 検証：
    expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).toBe("v1");
  });

  test("maxBytes が 0 のとき、空の Uint8Array は追い出されずに蓄積する", async ({
    expect,
    signal,
  }) => {
    // 準備：
    const storage = new LruCache({ maxBytes: 0 });
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行：
    storage.write(createSetContext("k1") as IStorage.WriteContext, new Uint8Array(0));
    storage.write(createSetContext("k2") as IStorage.WriteContext, new Uint8Array(0));

    // 検証：
    expect(storage.size).toBe(2);
    expect(storage.bytes).toBe(0);
    expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).toStrictEqual(
      new Uint8Array(0),
    );
    expect(storage.read(createGetContext("k2") as IStorage.ReadContext)).toStrictEqual(
      new Uint8Array(0),
    );
  });
});
