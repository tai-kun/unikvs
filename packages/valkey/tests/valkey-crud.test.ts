// oxlint-disable unicorn/number-literal-case
import type { IStorage } from "@unikvs/core";
import {
  bytesEqual,
  createGetContext,
  createHasContext,
  createSetContext,
  createOpenContext,
  createClearContext,
  createCloseContext,
  createAllByteValues,
  createDeleteContext,
} from "@unikvs/testing";
import { describe } from "vite-plus/test";

import { test, createStorage } from "./_helpers.js";

describe("基本データ操作 (CRUD)", () => {
  test("全 256 種類のバイト値を含むデータが byte-for-byte で往復する", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備：
    const key = "all-byte-values.bin";
    const data = createAllByteValues(1024);

    // 実行：
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

    const result = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);

    // 検証：
    expect(bytesEqual(result, data)).toBe(true);
  });

  test("0x00 だけで構成されたデータが往復する", async ({ expect, signal, storage }) => {
    // 準備：
    const key = "zeros.bin";
    const data = new Uint8Array(4096);

    // 実行：
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

    // 検証：
    await expect(
      storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).resolves.toStrictEqual(data);
  });

  test("0xff だけで構成されたデータが往復する", async ({ expect, signal, storage }) => {
    // 準備：
    const key = "ones.bin";
    const data = new Uint8Array(4096).fill(0xff);

    // 実行：
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

    // 検証：
    await expect(
      storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).resolves.toStrictEqual(data);
  });

  test("1 バイトのデータが往復する", async ({ expect, signal, storage }) => {
    // 準備：
    const key = "one-byte.bin";
    const data = new Uint8Array([0x42]);

    // 実行：
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

    // 検証：
    await expect(
      storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).resolves.toStrictEqual(data);
  });

  test("Unicode のテキストデータが byte-for-byte で往復する", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備：
    const key = "unicode-data.txt";
    const data = new TextEncoder().encode("こんにちは、世界! 🚀 Ω");

    // 実行：
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

    const result = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);

    // 検証：
    expect(new TextDecoder().decode(result)).toBe("こんにちは、世界! 🚀 Ω");
  });

  test("0 バイトのデータも exists が true になり往復する", async ({ expect, signal, storage }) => {
    // 準備：
    const key = "zero-length.bin";
    const data = new Uint8Array(0);

    // 実行：
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

    // 検証：
    await expect(
      storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext),
    ).resolves.toBe(true);
    await expect(
      storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).resolves.toStrictEqual(data);
  });

  test("削除を 2 回行っても 2 回目はエラーにならない", async ({ expect, signal, storage }) => {
    // 準備：
    const key = "delete-twice.bin";
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await storage.delete(createDeleteContext(key, { signal }) as IStorage.DeleteContext);

    // 実行と検証：
    await expect(
      storage.delete(createDeleteContext(key, { signal }) as IStorage.DeleteContext),
    ).resolves.toBeUndefined();
    await expect(
      storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext),
    ).resolves.toBe(false);
  });

  test("上書きで長さが短くなっても古いデータが残らない", async ({ expect, signal, storage }) => {
    // 準備：
    const key = "shrink.bin";
    const longData = createAllByteValues(1024);
    const shortData = new Uint8Array([1, 2, 3]);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, longData);

    // 実行：
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, shortData);

    // 検証：
    await expect(
      storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).resolves.toStrictEqual(shortData);
  });

  test("上書きで長さが長くなっても全体が置き換わる", async ({ expect, signal, storage }) => {
    // 準備：
    const key = "grow.bin";
    const shortData = new Uint8Array([1, 2, 3]);
    const longData = createAllByteValues(1024);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, shortData);

    // 実行：
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, longData);

    const result = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);

    // 検証：
    expect(bytesEqual(result, longData)).toBe(true);
  });

  test("1 つのキーを削除しても他のキーは残る", async ({ expect, signal, storage }) => {
    // 準備：
    await storage.write(
      createSetContext("keep-a.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await storage.write(
      createSetContext("remove.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([2]),
    );
    await storage.write(
      createSetContext("keep-b.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([3]),
    );

    // 実行：
    await storage.delete(createDeleteContext("remove.bin", { signal }) as IStorage.DeleteContext);

    // 検証：
    await expect(
      storage.exists(createHasContext("keep-a.bin", { signal }) as IStorage.ExistsContext),
    ).resolves.toBe(true);
    await expect(
      storage.exists(createHasContext("remove.bin", { signal }) as IStorage.ExistsContext),
    ).resolves.toBe(false);
    await expect(
      storage.exists(createHasContext("keep-b.bin", { signal }) as IStorage.ExistsContext),
    ).resolves.toBe(true);
  });

  test("前方一致する別のキーは互いに干渉しない", async ({ expect, signal, storage }) => {
    // 準備：
    const entries = [
      {
        key: "data",
        data: new Uint8Array([1]),
      },
      {
        key: "data.bak",
        data: new Uint8Array([2]),
      },
      {
        key: "data/child.bin",
        data: new Uint8Array([3]),
      },
    ];

    // 実行：
    for (const { key, data } of entries) {
      await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);
    }

    await storage.delete(createDeleteContext("data.bak", { signal }) as IStorage.DeleteContext);

    // 検証：
    await expect(
      storage.read(createGetContext("data", { signal }) as IStorage.ReadContext),
    ).resolves.toStrictEqual(new Uint8Array([1]));
    await expect(
      storage.exists(createHasContext("data.bak", { signal }) as IStorage.ExistsContext),
    ).resolves.toBe(false);
    await expect(
      storage.read(createGetContext("data/child.bin", { signal }) as IStorage.ReadContext),
    ).resolves.toStrictEqual(new Uint8Array([3]));
  });

  test("clear の後に同じキー空間を引き続き使用できる", async ({ expect, signal, storage }) => {
    // 準備：
    await storage.write(
      createSetContext("before-clear-1.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await storage.write(
      createSetContext("before-clear-2.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([2]),
    );

    // 実行：
    await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);
    await storage.write(
      createSetContext("after-clear.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([3]),
    );

    // 検証：
    await expect(
      storage.exists(createHasContext("before-clear-1.bin", { signal }) as IStorage.ExistsContext),
    ).resolves.toBe(false);
    await expect(
      storage.exists(createHasContext("before-clear-2.bin", { signal }) as IStorage.ExistsContext),
    ).resolves.toBe(false);
    await expect(
      storage.read(createGetContext("after-clear.bin", { signal }) as IStorage.ReadContext),
    ).resolves.toStrictEqual(new Uint8Array([3]));
  });

  test("clear は別プレフィックスのキーに影響しない", async ({
    fake,
    expect,
    signal,
    storage,
    keyPrefix,
  }) => {
    // 準備：
    const other = createStorage(fake, "unikvs-other:");

    await storage.write(
      createSetContext("mine.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await other.open(createOpenContext() as IStorage.OpenContext);
    await other.write(
      createSetContext("foreign.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([2]),
    );

    // 実行：
    await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

    // 検証：
    expect(fake.keys(`${keyPrefix}*`)).toStrictEqual([]);
    expect(fake.keys("unikvs-other:*")).toStrictEqual(["unikvs-other:foreign.bin"]);

    // 後始末：
    await other.close(createCloseContext() as IStorage.CloseContext);
  });

  test("多数のキーが存在しても clear は全キーを削除する", async ({
    fake,
    expect,
    signal,
    storage,
    keyPrefix,
  }) => {
    // 準備：
    const count = 2500;

    for (let index = 0; index < count; index += 1) {
      await storage.write(
        createSetContext(`bulk/${index}.bin`, { signal }) as IStorage.WriteContext,
        new Uint8Array([index % 256]),
      );
    }

    // 実行：
    await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

    // 検証：
    // 1 回の SCAN で取り切れない件数でもページを辿って削除できる。
    const probes = [0, 1, count - 2, count - 1];

    for (const index of probes) {
      await expect(
        storage.exists(createHasContext(`bulk/${index}.bin`, { signal }) as IStorage.ExistsContext),
      ).resolves.toBe(false);
    }
    // 削除し残しがないことも確認する。
    expect(fake.keys(`${keyPrefix}*`)).toStrictEqual([]);
  });

  test("空のキー空間に対する clear は成功する", async ({ expect, signal, storage }) => {
    // 準備と実行：
    await expect(
      storage.clear(createClearContext("", { signal }) as IStorage.ClearContext),
    ).resolves.toBeUndefined();
  });
});

describe("有効期限 (ttl)", () => {
  test("ttl を指定したとき、キーに有効期限が付与される", async ({
    fake,
    expect,
    signal,
    keyPrefix,
  }) => {
    // 準備：
    const storage = createStorage(fake, keyPrefix, { ttl: 60_000 });
    await storage.open(createOpenContext() as IStorage.OpenContext);

    try {
      // 実行：
      await storage.write(
        createSetContext("ttl.bin", { signal }) as IStorage.WriteContext,
        new Uint8Array([1, 2, 3]),
      );

      // 検証：
      const remaining = fake.pttl(`${keyPrefix}ttl.bin`);
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(60_000);

      await expect(
        storage.read(createGetContext("ttl.bin", { signal }) as IStorage.ReadContext),
      ).resolves.toStrictEqual(new Uint8Array([1, 2, 3]));
    } finally {
      await storage.close(createCloseContext() as IStorage.CloseContext);
    }
  });

  test("ttl を指定しないとき、キーに有効期限は付与されない", async ({
    fake,
    expect,
    signal,
    storage,
    keyPrefix,
  }) => {
    // 準備と実行：
    await storage.write(
      createSetContext("no-ttl.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 検証：
    expect(fake.pttl(`${keyPrefix}no-ttl.bin`)).toBe(-1);
  });

  test("期限切れのキーは存在しないものとして扱われる", async ({
    fake,
    expect,
    signal,
    keyPrefix,
  }) => {
    // 準備：
    let now = 1_000_000;
    fake.now = (): number => now;

    const storage = createStorage(fake, keyPrefix, { ttl: 100 });
    await storage.open(createOpenContext() as IStorage.OpenContext);

    try {
      await storage.write(
        createSetContext("expiry.bin", { signal }) as IStorage.WriteContext,
        new Uint8Array([9]),
      );

      // 実行：
      now += 101;

      // 検証：
      await expect(
        storage.exists(createHasContext("expiry.bin", { signal }) as IStorage.ExistsContext),
      ).resolves.toBe(false);
    } finally {
      await storage.close(createCloseContext() as IStorage.CloseContext);
    }
  });
});
