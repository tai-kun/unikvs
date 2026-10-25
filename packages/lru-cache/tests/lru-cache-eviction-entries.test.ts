import type { IStorage } from "@unikvs/core";
import {
  createGetContext,
  createHasContext,
  createSetContext,
  createOpenContext,
  createDeleteContext,
} from "@unikvs/testing";
import { test as vitest, describe } from "vite-plus/test";

import { KeyNotFoundError } from "../src/errors.js";
import LruCache from "../src/lru-cache.js";

/**
 * テストごとに件数上限付きの LruCache インスタンスを提供します。
 * 件数上限による追い出しの振る舞いを検証するために使用します。
 */
const test = vitest.extend<{ storage: LruCache }>({
  async storage({}, use) {
    const storage = new LruCache({ maxEntries: 2 });
    await storage.open(createOpenContext() as IStorage.OpenContext);
    await use(storage);
  },
});
describe("件数上限による追い出し", () => {
  test("上限を超えたとき、最も古いものから追い出される", ({ expect, storage }) => {
    // 準備と実行：
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    storage.write(createSetContext("k2") as IStorage.WriteContext, "v2");
    storage.write(createSetContext("k3") as IStorage.WriteContext, "v3");

    // 検証：
    expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(false);
    expect(storage.read(createGetContext("k2") as IStorage.ReadContext)).toBe("v2");
    expect(storage.read(createGetContext("k3") as IStorage.ReadContext)).toBe("v3");
    expect(storage.size).toBe(2);
  });

  test("read のヒット時は追い出し対象から除外される", ({ expect, storage }) => {
    // 準備：
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    storage.write(createSetContext("k2") as IStorage.WriteContext, "v2");
    storage.read(createGetContext("k1") as IStorage.ReadContext);

    // 実行：
    storage.write(createSetContext("k3") as IStorage.WriteContext, "v3");

    // 検証：
    expect(storage.exists(createHasContext("k2") as IStorage.ExistsContext)).toBe(false);
    expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).toBe("v1");
    expect(storage.read(createGetContext("k3") as IStorage.ReadContext)).toBe("v3");
  });

  test("上書きしたキーは最も新しいものとして扱われる", ({ expect, storage }) => {
    // 準備：
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    storage.write(createSetContext("k2") as IStorage.WriteContext, "v2");
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1-updated");

    // 実行：
    storage.write(createSetContext("k3") as IStorage.WriteContext, "v3");

    // 検証：
    expect(storage.exists(createHasContext("k2") as IStorage.ExistsContext)).toBe(false);
    expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).toBe("v1-updated");
    expect(storage.read(createGetContext("k3") as IStorage.ReadContext)).toBe("v3");
  });

  test("exists は直近使用順を更新しない", ({ expect, storage }) => {
    // 準備：
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    storage.write(createSetContext("k2") as IStorage.WriteContext, "v2");
    storage.exists(createHasContext("k1") as IStorage.ExistsContext);

    // 実行：
    storage.write(createSetContext("k3") as IStorage.WriteContext, "v3");

    // 検証：
    expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(false);
    expect(storage.read(createGetContext("k2") as IStorage.ReadContext)).toBe("v2");
    expect(storage.read(createGetContext("k3") as IStorage.ReadContext)).toBe("v3");
  });

  test("delete した分だけ追い出しが遅れる", ({ expect, storage }) => {
    // 準備：
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    storage.write(createSetContext("k2") as IStorage.WriteContext, "v2");
    storage.delete(createDeleteContext("k1") as IStorage.DeleteContext);

    // 実行：
    storage.write(createSetContext("k3") as IStorage.WriteContext, "v3");

    // 検証：
    expect(storage.size).toBe(2);
    expect(storage.read(createGetContext("k2") as IStorage.ReadContext)).toBe("v2");
    expect(storage.read(createGetContext("k3") as IStorage.ReadContext)).toBe("v3");
  });

  test("上限なしでは memory と等価にすべて保持される", async ({ expect, signal }) => {
    // 準備：
    const unbounded = new LruCache();
    await unbounded.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行：
    for (let i = 0; i < 100; i += 1) {
      unbounded.write(createSetContext(`k${i}`) as IStorage.WriteContext, `v${i}`);
    }

    // 検証：
    expect(unbounded.size).toBe(100);
    expect(unbounded.read(createGetContext("k0") as IStorage.ReadContext)).toBe("v0");
    expect(unbounded.read(createGetContext("k99") as IStorage.ReadContext)).toBe("v99");
  });
});
describe("maxEntries が 0 のとき", () => {
  test("書き込みは受理するが直ちに追い出され、size は 0 のままである", async ({
    expect,
    signal,
  }) => {
    // 準備：
    const storage = new LruCache({ maxEntries: 0 });
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行：
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");

    // 検証：
    expect(storage.size).toBe(0);
    expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(false);
    expect(() => storage.read(createGetContext("k1") as IStorage.ReadContext)).toThrow(
      KeyNotFoundError,
    );
  });

  test("繰り返し書き込んでも記録が壊れず、size は 0 のままである", async ({ expect, signal }) => {
    // 準備：
    const storage = new LruCache({ maxEntries: 0 });
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行：
    storage.write(createSetContext("k1") as IStorage.WriteContext, "v1");
    storage.write(createSetContext("k2") as IStorage.WriteContext, "v2");

    // 検証：
    expect(storage.size).toBe(0);
    expect(storage.exists(createHasContext("k1") as IStorage.ExistsContext)).toBe(false);
    expect(storage.exists(createHasContext("k2") as IStorage.ExistsContext)).toBe(false);
  });
});
