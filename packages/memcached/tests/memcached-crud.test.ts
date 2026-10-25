import type { IStorage } from "@unikvs/core";
import {
  bytesEqual,
  abortedSignal,
  captureRejection,
  createGetContext,
  createHasContext,
  createSetContext,
  createOpenContext,
  createClearContext,
  createCloseContext,
  createAllByteValues,
  createDeleteContext,
  createPseudoRandomBytes,
} from "@unikvs/testing";
import { describe } from "vite-plus/test";

// oxlint-disable unicorn/number-literal-case
import { KeyNotFoundError } from "../src/errors.js";
import type { MemcachedClientLike } from "../src/memcached.js";
import { test, createStorage, randomKeyPrefix } from "./_helpers.js";

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

  test("1 MiB の単発 write が往復する", async ({ expect, signal, storage }) => {
    // 準備：
    const key = "one-mib.bin";
    const data = createPseudoRandomBytes(1024 * 1024, 42);

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

  test("プレフィックスが異なるインスタンスは同じキーを共有しない", async ({
    client,
    expect,
    signal,
    storage,
    keyPrefix,
  }) => {
    // 準備：
    const key = "isolated.bin";
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 実行と検証：
    const other = createStorage(client, `other-${keyPrefix}`);
    await other.open(createOpenContext() as IStorage.OpenContext);

    try {
      await expect(
        other.exists(createHasContext(key, { signal }) as IStorage.ExistsContext),
      ).resolves.toBe(false);
    } finally {
      await other.close(createCloseContext() as IStorage.CloseContext);
    }
  });

  test("多数のキーが存在しても clear は全キーを削除する", async ({
    client,
    expect,
    signal,
    storage,
  }) => {
    // 準備：
    const count = 500;

    for (let index = 0; index < count; index++) {
      await storage.write(
        createSetContext(`bulk/${index}.bin`, { signal }) as IStorage.WriteContext,
        new Uint8Array([index % 256]),
      );
    }

    // 実行：
    await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

    // 検証：
    expect(client.size).toBe(0);
    const probes = [0, 1, count - 2, count - 1];

    for (const index of probes) {
      await expect(
        storage.exists(createHasContext(`bulk/${index}.bin`, { signal }) as IStorage.ExistsContext),
      ).resolves.toBe(false);
    }
  });
});

describe("注入クライアントの get 戻り値", () => {
  test("get が Base64 文字列をそのまま返すクライアントでも読み取れる", async ({
    expect,
    signal,
  }) => {
    // 準備：
    // `MemcachedGetResult` は memjs の `{ value }` 形式に加えて生の文字列も受け付けます。
    const client: MemcachedClientLike = {
      get: async () => "AQID",
      set: async () => true,
      quit: () => {},
      flush: async () => true,
      delete: async () => true,
    };
    const storage = createStorage(client, randomKeyPrefix());
    await storage.open(createOpenContext() as IStorage.OpenContext);

    try {
      // 実行と検証：
      await expect(
        storage.read(createGetContext("raw-string.bin", { signal }) as IStorage.ReadContext),
      ).resolves.toStrictEqual(new Uint8Array([1, 2, 3]));
    } finally {
      await storage.close(createCloseContext() as IStorage.CloseContext);
    }
  });

  test("get が Base64 のバイト列を返すクライアントでも読み取れる", async ({ expect, signal }) => {
    // 準備：
    const client: MemcachedClientLike = {
      get: async () => new TextEncoder().encode("AQID"),
      set: async () => true,
      quit: () => {},
      flush: async () => true,
      delete: async () => true,
    };
    const storage = createStorage(client, randomKeyPrefix());
    await storage.open(createOpenContext() as IStorage.OpenContext);

    try {
      // 実行と検証：
      await expect(
        storage.read(createGetContext("raw-bytes.bin", { signal }) as IStorage.ReadContext),
      ).resolves.toStrictEqual(new Uint8Array([1, 2, 3]));
    } finally {
      await storage.close(createCloseContext() as IStorage.CloseContext);
    }
  });
});

describe("読み取れないキー", () => {
  test("削除したキーの read は KeyNotFoundError を投げる", async ({ expect, signal, storage }) => {
    // 準備：
    const key = "deleted.bin";
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await storage.delete(createDeleteContext(key, { signal }) as IStorage.DeleteContext);

    // 実行と検証：
    await expect(
      storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).rejects.toThrow(KeyNotFoundError);
  });

  test("clear したキーの read は KeyNotFoundError を投げる", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備：
    const key = "cleared.bin";
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 実行：
    await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

    // 検証：
    await expect(
      storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).rejects.toThrow(KeyNotFoundError);
  });
});

describe("中断の検証", () => {
  // 実装は各操作の入口で `throwIfAborted` するのみで、開始後の中断はサポートしません。
  // そのため「中断済みシグナルでは操作を開始せず、バックエンドに副作用が及ばない」ことを検証します。
  test("中断済みシグナルでの write は拒否され、クライアントに書き込まれない", async ({
    client,
    expect,
    storage,
  }) => {
    // 準備：
    const signal = abortedSignal();

    // 実行：
    const error = await captureRejection(
      storage.write(
        createSetContext("aborted-write.bin", { signal }) as IStorage.WriteContext,
        new Uint8Array([1]),
      ),
    );

    // 検証：
    expect(error).toHaveProperty("name", "AbortError");

    expect(client.setCalls).toStrictEqual([]);
  });

  test("中断済みシグナルでの read は拒否され、クライアントを呼び出さない", async ({
    client,
    expect,
    storage,
  }) => {
    // 準備：
    const signal = abortedSignal();
    const getCallsBefore = client.getCalls;

    // 実行：
    const error = await captureRejection(
      storage.read(createGetContext("aborted-read.bin", { signal }) as IStorage.ReadContext),
    );

    // 検証：
    expect(error).toHaveProperty("name", "AbortError");
    expect(client.getCalls).toBe(getCallsBefore);
  });

  test("中断済みシグナルでの exists は拒否され、クライアントを呼び出さない", async ({
    client,
    expect,
    storage,
  }) => {
    // 準備：
    const signal = abortedSignal();
    const getCallsBefore = client.getCalls;

    // 実行：
    const error = await captureRejection(
      storage.exists(createHasContext("aborted-exists.bin", { signal }) as IStorage.ExistsContext),
    );

    // 検証：
    expect(error).toHaveProperty("name", "AbortError");
    expect(client.getCalls).toBe(getCallsBefore);
  });

  test("中断済みシグナルでの delete は拒否され、クライアントを呼び出さない", async ({
    client,
    expect,
    storage,
  }) => {
    // 準備：
    const signal = abortedSignal();
    const deleteCallsBefore = client.deleteCalls;

    // 実行：
    const error = await captureRejection(
      storage.delete(
        createDeleteContext("aborted-delete.bin", { signal }) as IStorage.DeleteContext,
      ),
    );

    // 検証：
    expect(error).toHaveProperty("name", "AbortError");
    expect(client.deleteCalls).toBe(deleteCallsBefore);
  });

  test("中断済みシグナルでの clear は拒否され、クライアントを呼び出さない", async ({
    client,
    expect,
    storage,
  }) => {
    // 準備：
    const signal = abortedSignal();
    const flushCallsBefore = client.flushCalls;

    // 実行：
    const error = await captureRejection(
      storage.clear(createClearContext("", { signal }) as IStorage.ClearContext),
    );

    // 検証：
    expect(error).toHaveProperty("name", "AbortError");
    expect(client.flushCalls).toBe(flushCallsBefore);
  });
});
