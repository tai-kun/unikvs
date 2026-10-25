import type { IStorage } from "@unikvs/core";
import {
  bytesEqual,
  createGetContext,
  createHasContext,
  createSetContext,
  createClearContext,
  createAllByteValues,
  createDeleteContext,
} from "@unikvs/testing";
import { describe } from "vite-plus/test";

// oxlint-disable unicorn/number-literal-case
import { test, listKeys } from "./_helpers.js";

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

  test("5 MiB の単発 write が往復する", async ({ expect, signal, storage }) => {
    // 準備：
    const key = "five-mib.bin";
    const data = createAllByteValues(5 * 1024 * 1024);

    // 実行：
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

    const result = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);

    // 検証：
    expect(bytesEqual(result, data)).toBe(true);
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

  test("多数のキーが存在しても clear は全キーを削除する", async ({
    client,
    expect,
    signal,
    storage,
    keyPrefix,
  }) => {
    // 準備：
    const count = 2500;
    const entries = Array.from({ length: count }, (_, index) => ({
      key: `bulk/${index}.bin`,
      data: new Uint8Array([index % 256]),
    }));
    // 1 回の SCAN で取り切れない件数でもページを辿って削除できるようにする。
    for (let start = 0; start < entries.length; start += 50) {
      await Promise.all(
        entries
          .slice(start, start + 50)
          .map(({ key, data }) =>
            storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data),
          ),
      );
    }

    // 実行：
    await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

    // 検証：
    const probes = [0, 1, count - 2, count - 1];

    for (const index of probes) {
      await expect(
        storage.exists(createHasContext(`bulk/${index}.bin`, { signal }) as IStorage.ExistsContext),
      ).resolves.toBe(false);
    }
    // 削除し残しがないことも確認する。
    await expect(listKeys(client, `${keyPrefix}*`)).resolves.toStrictEqual([]);
  });
});
