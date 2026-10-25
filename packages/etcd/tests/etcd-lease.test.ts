import type { IStorage } from "@unikvs/core";
import {
  collectBytes,
  createGetContext,
  createHasContext,
  createSetContext,
  createOpenContext,
  createClearContext,
  createCloseContext,
  createStreamContext,
} from "@unikvs/testing";
import { vi, test, expect, describe } from "vite-plus/test";

import { KeyNotFoundError, InvalidLeaseTtlError, InvalidEndpointsError } from "../src/errors.js";
import Etcd, { type EtcdClientLike, wrapNativeEtcdClient } from "../src/etcd.js";
import { closeStorage, createStorage, FakeEtcdClient } from "./_helpers.js";

const { Etcd3: MockedEtcd3, instances } = vi.hoisted(() => {
  const hoistedInstances: {
    closed: boolean;
    options: unknown;
  }[] = [];

  class HoistedMockedEtcd3 {
    public closed = false;

    public readonly options: unknown;

    public constructor(options?: unknown) {
      this.options = options;
      hoistedInstances.push({
        closed: false,
        options,
      });
    }

    public close(): void {
      this.closed = true;
      const record = hoistedInstances.find((instance) => instance.options === this.options);

      if (record !== undefined) {
        record.closed = true;
      }
    }
  }

  return {
    Etcd3: HoistedMockedEtcd3,
    instances: hoistedInstances,
  };
});
vi.mock("etcd3", () => ({ Etcd3: MockedEtcd3 }));

describe("リース (TTL) 付き書き込み", () => {
  test("leaseTtlSeconds を指定すると put に TTL が渡される", async () => {
    const { client, signal, storage } = await createStorage({ leaseTtlSeconds: 60 });

    try {
      await storage.write(
        createSetContext("leased.bin", { signal }) as IStorage.WriteContext,
        new Uint8Array([1, 2, 3]),
      );

      expect(client.puts).toHaveLength(1);
      expect(client.puts[0]?.options).toStrictEqual({ leaseTtlSeconds: 60 });
      await expect(
        storage.read(createGetContext("leased.bin", { signal }) as IStorage.ReadContext),
      ).resolves.toStrictEqual(new Uint8Array([1, 2, 3]));
    } finally {
      await closeStorage(storage);
    }
  });

  test("leaseTtlSeconds 未指定のとき put にオプションは渡されない", async () => {
    const { client, signal, storage } = await createStorage();

    try {
      await storage.write(
        createSetContext("plain.bin", { signal }) as IStorage.WriteContext,
        new Uint8Array([1]),
      );

      expect(client.puts).toHaveLength(1);
      expect(client.puts[0]?.options).toBeUndefined();
    } finally {
      await closeStorage(storage);
    }
  });

  test("ストリーム書き込みにも TTL が適用される", async () => {
    const { client, signal, storage } = await createStorage({ leaseTtlSeconds: 30 });

    try {
      const writable = storage.getWritable(
        createSetContext("stream-leased.bin", { signal }) as IStorage.GetWritableContext,
      );
      const writer = writable.getWriter();
      await writer.write(new Uint8Array([7, 8]));
      await writer.close();

      expect(client.puts).toHaveLength(1);
      expect(client.puts[0]?.options).toStrictEqual({ leaseTtlSeconds: 30 });
    } finally {
      await closeStorage(storage);
    }
  });

  test.each([0, -1, 1.5, Number.NaN, "60"])(
    "不正な leaseTtlSeconds (%s) は構築時に拒否される",
    (leaseTtlSeconds) => {
      expect(() => new Etcd({ leaseTtlSeconds: leaseTtlSeconds as unknown as number })).toThrow(
        InvalidLeaseTtlError,
      );
    },
  );
});

describe("エンドポイントの検証", () => {
  test("空文字の endpoints は拒否される", () => {
    expect(() => new Etcd({ endpoints: "" })).toThrow(InvalidEndpointsError);
  });

  test("空配列の endpoints は拒否される", () => {
    expect(() => new Etcd({ endpoints: [] })).toThrow(InvalidEndpointsError);
  });

  test("空文字を含む endpoints は拒否される", () => {
    expect(() => new Etcd({ endpoints: ["http://127.0.0.1:2379", ""] })).toThrow(
      InvalidEndpointsError,
    );
  });

  test("文字列と配列の endpoints を受け付ける", () => {
    const fromString = new Etcd({ endpoints: "http://127.0.0.1:2379" });
    const fromArray = new Etcd({ endpoints: ["http://127.0.0.1:2379", "http://127.0.0.2:2379"] });
    expect(fromString.isOpen).toBe(false);
    expect(fromArray.isOpen).toBe(false);
  });
});

describe("値の正規化", () => {
  test("get が文字列を返しても UTF-8 として読み取れる", async () => {
    const text = "こんにちは、etcd! 🚀";
    const client: EtcdClientLike = {
      get: async () => text,
      put: async () => {},
      delete: async () => {},
      getAll: async () => ({}),
    };
    const storage = new Etcd({ client });
    await storage.open(createOpenContext() as IStorage.OpenContext);

    try {
      const signal = new AbortController().signal;
      await expect(
        storage.read(createGetContext("k", { signal }) as IStorage.ReadContext),
      ).resolves.toStrictEqual(new TextEncoder().encode(text));
      await expect(
        storage.exists(createHasContext("k", { signal }) as IStorage.ExistsContext),
      ).resolves.toBe(true);
    } finally {
      await closeStorage(storage);
    }
  });

  test("get が undefined を返したときは存在しないものとして扱う", async () => {
    const client: EtcdClientLike = {
      get: async () => {},
      put: async () => {},
      delete: async () => {},
      getAll: async () => ({}),
    };
    const storage = new Etcd({ client });
    await storage.open(createOpenContext() as IStorage.OpenContext);

    try {
      const signal = new AbortController().signal;
      await expect(
        storage.read(createGetContext("k", { signal }) as IStorage.ReadContext),
      ).rejects.toThrow(KeyNotFoundError);
      await expect(
        storage.exists(createHasContext("k", { signal }) as IStorage.ExistsContext),
      ).resolves.toBe(false);
      await expect(
        collectBytes(
          storage.getReadable(createStreamContext("k", { signal }) as IStorage.GetReadableContext),
        ),
      ).rejects.toThrow(KeyNotFoundError);
    } finally {
      await closeStorage(storage);
    }
  });
});

describe("getAll の形状差吸収", () => {
  test("配列形式の getAll でも clear できる", async () => {
    const backing = new Map<string, Buffer>([["p:a", Buffer.from([1])]]);
    const client: EtcdClientLike = {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      get: async (key: string) => backing.get(key) ?? null,
      put: async (key: string, value: Uint8Array | string | Buffer) => {
        // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
        backing.set(key, typeof value === "string" ? Buffer.from(value) : Buffer.from(value));
      },
      delete: async (key: string) => {
        backing.delete(key);
      },
      getAll: async () => [...backing].map(([key, value]) => [key, Buffer.from(value)] as const),
    };
    const storage = new Etcd({
      client,
      keyPrefix: "p:",
    });
    await storage.open(createOpenContext() as IStorage.OpenContext);

    try {
      const signal = new AbortController().signal;
      await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

      expect(backing.size).toBe(0);
    } finally {
      await closeStorage(storage);
    }
  });

  test("Record 形式の getAll でも clear できる", async () => {
    const backing = new Map<string, Buffer>([["p:a", Buffer.from([1])]]);
    const client: EtcdClientLike = {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      get: async (key: string) => backing.get(key) ?? null,
      put: async () => {},
      delete: async (key: string) => {
        backing.delete(key);
      },
      getAll: async () => Object.fromEntries(backing),
    };
    const storage = new Etcd({
      client,
      keyPrefix: "p:",
    });
    await storage.open(createOpenContext() as IStorage.OpenContext);

    try {
      const signal = new AbortController().signal;
      await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

      expect(backing.size).toBe(0);
    } finally {
      await closeStorage(storage);
    }
  });

  test("clear のフォールバックでは接頭辞外のキーを削除しない", async () => {
    const backing = new Map<string, Buffer>([
      ["p:inside", Buffer.from([1])],
      ["outside", Buffer.from([9])],
    ]);
    const client: EtcdClientLike = {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
      get: async (key: string) => backing.get(key) ?? null,
      put: async () => {},
      delete: async (key: string) => {
        backing.delete(key);
      },
      // 実装差で範囲外が混ざった場合を再現する。
      getAll: async () => new Map(backing),
    };
    const storage = new Etcd({
      client,
      keyPrefix: "p:",
    });
    await storage.open(createOpenContext() as IStorage.OpenContext);

    try {
      const signal = new AbortController().signal;
      await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

      expect(backing.has("p:inside")).toBe(false);
      expect(backing.get("outside")).toStrictEqual(Buffer.from([9]));
    } finally {
      await closeStorage(storage);
    }
  });
});

/**
 * etcd3 ネイティブ操作の最小スタブです。
 */
class StubNativeClient {
  readonly store = new Map<string, Buffer>();

  readonly directPuts: {
    readonly key: string;
    readonly value: Buffer;
  }[] = [];

  readonly leasePuts: {
    readonly key: string;
    readonly ttl: number;
    readonly value: Buffer;
  }[] = [];

  leasesCreated = 0;

  releasedLeases = 0;

  closed = false;

  public get(key: string | Buffer): { buffer(): Promise<Buffer | null> } {
    const name = key.toString();

    return {
      buffer: async (): Promise<Buffer | null> => {
        const value = this.store.get(name);

        return value === undefined ? null : Buffer.from(value);
      },
    };
  }

  public getAll(): {
    prefix(value: string | Buffer): { buffers(): Promise<Record<string, Buffer>> };
  } {
    return {
      prefix: (prefix: string | Buffer) => ({
        buffers: async (): Promise<Record<string, Buffer>> => {
          const name = prefix.toString();
          const out: Record<string, Buffer> = {};

          for (const [key, value] of this.store) {
            if (key.startsWith(name)) {
              out[key] = value;
            }
          }

          return out;
        },
      }),
    };
  }

  public put(key: string | Buffer): { value(value: string | Buffer): Promise<void> } {
    const name = key.toString();

    return {
      value: async (value: string | Buffer): Promise<void> => {
        const data = typeof value === "string" ? Buffer.from(value) : Buffer.from(value);
        this.store.set(name, data);
        this.directPuts.push({
          key: name,
          value: Buffer.from(data),
        });
      },
    };
  }

  public delete(): {
    key(value: string | Buffer): { exec(): Promise<void> };
    prefix(value: string | Buffer): { exec(): Promise<void> };
  } {
    const remove = (name: string, prefix: boolean): void => {
      for (const key of this.store.keys()) {
        if (prefix ? key.startsWith(name) : key === name) {
          this.store.delete(key);
        }
      }
    };

    return {
      key: (value: string | Buffer) => ({
        exec: async (): Promise<void> => {
          remove(value.toString(), false);
        },
      }),
      prefix: (value: string | Buffer) => ({
        exec: async (): Promise<void> => {
          remove(value.toString(), true);
        },
      }),
    };
  }

  public lease(ttl: number): {
    put(key: string | Buffer): { value(value: string | Buffer): Promise<void> };
    release(): void;
  } {
    this.leasesCreated += 1;

    return {
      put: (key: string | Buffer) => ({
        value: async (value: string | Buffer): Promise<void> => {
          const name = key.toString();
          const data = typeof value === "string" ? Buffer.from(value) : Buffer.from(value);
          this.store.set(name, data);
          this.leasePuts.push({
            key: name,
            ttl,
            value: Buffer.from(data),
          });
        },
      }),
      release: (): void => {
        this.releasedLeases += 1;
      },
    };
  }

  public close(): void {
    this.closed = true;
  }
}

describe("ネイティブクライアントの適合", () => {
  test("TTL なしの put は直接書き込む", async () => {
    const raw = new StubNativeClient();
    const client = wrapNativeEtcdClient(raw);
    await client.put("k", Buffer.from([1, 2]));
    expect(raw.directPuts).toHaveLength(1);
    expect(raw.leasesCreated).toBe(0);
    await expect(client.get("k")).resolves.toStrictEqual(Buffer.from([1, 2]));
  });

  test("TTL 付きの put はリース経由で書き込み、リースを使い回す", async () => {
    const raw = new StubNativeClient();
    const client = wrapNativeEtcdClient(raw, 60);
    await client.put("a", Buffer.from([1]));
    await client.put("a2", Buffer.from([2]));
    await client.put("b", Buffer.from([3]), { leaseTtlSeconds: 10 });
    expect(raw.leasesCreated).toBe(2);
    expect(raw.leasePuts.map(({ ttl }) => ttl)).toStrictEqual([60, 60, 10]);
    await expect(client.get("a")).resolves.toStrictEqual(Buffer.from([1]));
  });

  test("文字列値も Buffer に変換して書き込む", async () => {
    const raw = new StubNativeClient();
    const client = wrapNativeEtcdClient(raw);
    await client.put("s", "hello");
    await expect(client.get("s")).resolves.toStrictEqual(Buffer.from("hello"));
  });

  test("存在しないキーの get は null を返す", async () => {
    const raw = new StubNativeClient();
    const client = wrapNativeEtcdClient(raw);
    await expect(client.get("missing")).resolves.toBeNull();
  });

  test("getAll は接頭辞に一致する Record を返す", async () => {
    const raw = new StubNativeClient();
    raw.store.set("p:a", Buffer.from([1]));
    raw.store.set("other", Buffer.from([2]));

    const client = wrapNativeEtcdClient(raw);
    await expect(client.getAll("p:")).resolves.toStrictEqual({ "p:a": Buffer.from([1]) });
  });

  test("delete と deletePrefix が動作する", async () => {
    const raw = new StubNativeClient();
    raw.store.set("p:a", Buffer.from([1]));
    raw.store.set("p:b", Buffer.from([2]));

    const client = wrapNativeEtcdClient(raw);
    await client.delete("p:a");

    expect(raw.store.has("p:a")).toBe(false);

    await client.deletePrefix?.("p:");
    expect(raw.store.size).toBe(0);
  });

  test("close はリースを解放してクライアントを閉じる", async () => {
    const raw = new StubNativeClient();
    const client = wrapNativeEtcdClient(raw, 60);
    await client.put("a", Buffer.from([1]));
    await client.put("b", Buffer.from([2]), { leaseTtlSeconds: 10 });
    client.close();
    expect(raw.releasedLeases).toBe(2);
    expect(raw.closed).toBe(true);
  });

  test("close はリースなしでもクライアントを閉じる", () => {
    const raw = new StubNativeClient();
    const client = wrapNativeEtcdClient(raw);
    client.close();
    expect(raw.releasedLeases).toBe(0);
    expect(raw.closed).toBe(true);
  });
});

describe("open の接続先解決", () => {
  test("未指定のときは既定のエンドポイントで接続する", async () => {
    const storage = new Etcd();
    await storage.open(createOpenContext() as IStorage.OpenContext);

    try {
      expect(storage.isOpen).toBe(true);
      const latest = instances.at(-1);
      expect(latest?.options).toStrictEqual({ hosts: ["http://127.0.0.1:2379"] });
    } finally {
      await storage.close(createCloseContext() as IStorage.CloseContext);
    }
  });

  test("文字列の endpoints を配列化して渡す", async () => {
    const storage = new Etcd({ endpoints: "http://etcd:2379" });
    await storage.open(createOpenContext() as IStorage.OpenContext);

    try {
      const latest = instances.at(-1);
      expect(latest?.options).toStrictEqual({ hosts: ["http://etcd:2379"] });
    } finally {
      await storage.close(createCloseContext() as IStorage.CloseContext);
    }
  });

  test("配列の endpoints をそのままホスト一覧として渡す", async () => {
    const endpoints = ["http://a:2379", "http://b:2379"] as const;
    const storage = new Etcd({ endpoints });
    await storage.open(createOpenContext() as IStorage.OpenContext);

    try {
      const latest = instances.at(-1);
      expect(latest?.options).toStrictEqual({ hosts: [...endpoints] });
    } finally {
      await storage.close(createCloseContext() as IStorage.CloseContext);
    }
  });

  test("client を指定したときは Etcd3 を構築しない", async () => {
    const constructed = instances.length;
    const client = new FakeEtcdClient();
    // endpoints は使われないため、到達不能な値を渡しても接続しない。
    const storage = new Etcd({
      client,
      endpoints: "http://ignored.invalid:2379",
    });
    await storage.open(createOpenContext() as IStorage.OpenContext);

    try {
      await storage.write(
        createSetContext("injected.bin", {
          signal: new AbortController().signal,
        }) as IStorage.WriteContext,
        new Uint8Array([1]),
      );

      expect(instances).toHaveLength(constructed);
      expect(client.puts).toHaveLength(1);
    } finally {
      await storage.close(createCloseContext() as IStorage.CloseContext);
    }
  });

  test("close はネイティブクライアントを閉じる", async () => {
    const storage = new Etcd();
    await storage.open(createOpenContext() as IStorage.OpenContext);
    await storage.close(createCloseContext() as IStorage.CloseContext);

    const latest = instances.at(-1);
    expect(latest?.closed).toBe(true);

    expect(storage.isOpen).toBe(false);
  });

  test("ETCD_ENDPOINTS 環境変数 (カンマ区切り) を使う", async () => {
    vi.stubEnv("ETCD_ENDPOINTS", "http://a:2379, http://b:2379");
    try {
      const storage = new Etcd();
      await storage.open(createOpenContext() as IStorage.OpenContext);

      try {
        const latest = instances.at(-1);
        expect(latest?.options).toStrictEqual({ hosts: ["http://a:2379", "http://b:2379"] });
      } finally {
        await storage.close(createCloseContext() as IStorage.CloseContext);
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
