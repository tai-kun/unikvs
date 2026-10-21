import type { IStorage } from "@unikvs/core";
import {
  abortedSignal,
  bytesEqual,
  captureRejection,
  createAllByteValues,
  createClearContext,
  createCloseContext,
  createDeleteContext,
  createGetContext,
  createHasContext,
  createOpenContext,
  createSetContext,
} from "@unikvs/testing";
import { beforeEach, describe, test, vi } from "vitest";

import {
  ClearWithoutPrefixNotAllowedError,
  ClientNotAvailableError,
  InvalidTtlSecondsError,
  KeyNotFoundError,
} from "../src/errors.js";
import VercelKv, { type KVClientLike } from "../src/vercel-kv.js";
import { FakeKv } from "./_helpers.js";

const kvModule = vi.hoisted(() => ({
  createClientCalls: [] as { readonly url: string; readonly token: string }[],
  createClient: undefined as
    | ((config: { readonly url: string; readonly token: string }) => unknown)
    | undefined,
}));

// `@vercel/kv` は任意依存です。実モジュールの有無やネットワークに依存せず、
// `VercelKv` が `createClient` をどう解決・再利用するかを検証するために差し替えます。
vi.mock("@vercel/kv", () => ({
  get createClient() {
    return kvModule.createClient;
  },
}));

function stubKvModule(
  createClient: (config: { url: string; token: string }) => KVClientLike,
): void {
  kvModule.createClient = (config) => {
    kvModule.createClientCalls.push(config);

    return createClient(config);
  };
}

function freshSignal(): AbortSignal {
  return AbortSignal.timeout(5_000);
}

beforeEach(() => {
  kvModule.createClientCalls.length = 0;
  kvModule.createClient = undefined;
  vi.unstubAllEnvs();
});

describe("ライフサイクル", () => {
  test("ストレージ名は VercelKv である", ({ expect }) => {
    // 準備と実行
    const storage = new VercelKv({ kv: new FakeKv() });

    // 検証
    expect(storage.name).toBe("VercelKv");
  });

  test("初期状態でも isOpen は true である (HTTP 系のため常時利用可能)", ({ expect }) => {
    // 準備
    const storage = new VercelKv({ kv: new FakeKv() });

    // 実行と検証
    expect(storage.isOpen).toBe(true);
  });

  test("open と close は signal 検証のみ行う", async ({ expect }) => {
    // 準備
    const storage = new VercelKv({ kv: new FakeKv() });

    // 実行と検証
    await expect(
      storage.open(createOpenContext({ signal: freshSignal() }) as IStorage.OpenContext),
    ).resolves.toBeUndefined();
    await expect(
      storage.close(createCloseContext({ signal: freshSignal() }) as IStorage.CloseContext),
    ).resolves.toBeUndefined();
    expect(storage.isOpen).toBe(true);
  });

  test("中断済みシグナルの open と close は中断例外を投げる", async ({ expect }) => {
    // 準備
    const storage = new VercelKv({ kv: new FakeKv() });

    // 実行と検証
    await expect(
      storage.open(createOpenContext({ signal: abortedSignal() }) as IStorage.OpenContext),
    ).rejects.toBeInstanceOf(DOMException);
    await expect(
      storage.close(createCloseContext({ signal: abortedSignal() }) as IStorage.CloseContext),
    ).rejects.toBeInstanceOf(DOMException);
  });

  test("open せずに直接操作できる", async ({ expect }) => {
    // 準備
    const kv = new FakeKv();
    const storage = new VercelKv({ kv });
    const data = new Uint8Array([1, 2, 3]);

    // 実行
    await storage.write(
      createSetContext("direct.bin", { signal: freshSignal() }) as IStorage.WriteContext,
      data,
    );

    // 検証
    await expect(
      storage.read(
        createGetContext("direct.bin", { signal: freshSignal() }) as IStorage.ReadContext,
      ),
    ).resolves.toStrictEqual(data);
  });
});

describe("基本データ操作 (CRUD)", () => {
  test("全 256 種類のバイト値を含むデータが byte-for-byte で往復する", async ({ expect }) => {
    // 準備
    const kv = new FakeKv();
    const storage = new VercelKv({ kv });
    const data = createAllByteValues(1024);

    // 実行
    await storage.write(
      createSetContext("all-byte-values.bin", { signal: freshSignal() }) as IStorage.WriteContext,
      data,
    );
    const result = await storage.read(
      createGetContext("all-byte-values.bin", { signal: freshSignal() }) as IStorage.ReadContext,
    );

    // 検証
    expect(bytesEqual(result, data)).toBe(true);
  });

  test("0 バイトのデータも exists が true になり往復する", async ({ expect }) => {
    // 準備
    const kv = new FakeKv();
    const storage = new VercelKv({ kv });

    // 実行
    await storage.write(
      createSetContext("zero-length.bin", { signal: freshSignal() }) as IStorage.WriteContext,
      new Uint8Array(0),
    );

    // 検証
    await expect(
      storage.exists(
        createHasContext("zero-length.bin", {
          signal: freshSignal(),
        }) as IStorage.ExistsContext,
      ),
    ).resolves.toBe(true);
    await expect(
      storage.read(
        createGetContext("zero-length.bin", { signal: freshSignal() }) as IStorage.ReadContext,
      ),
    ).resolves.toStrictEqual(new Uint8Array(0));
  });

  test("保存値は標準 Base64 文字列と一致し、読み取りで元のバイト列に戻る", async ({ expect }) => {
    // 準備
    const kv = new FakeKv();
    const storage = new VercelKv({ kv });
    // Base64 のパディングが 0/1/2 個になる長さと、任意のバイナリを含めます。
    const cases = [
      new Uint8Array(0),
      new Uint8Array([0]),
      new Uint8Array([0, 127]),
      new Uint8Array([0, 127, 255]),
      new TextEncoder().encode("こんにちは、世界! 🚀 Ω"),
      createAllByteValues(256),
    ];

    for (const [index, data] of cases.entries()) {
      const key = `base64-${index}.bin`;

      // 実行
      await storage.write(
        createSetContext(key, { signal: freshSignal() }) as IStorage.WriteContext,
        data,
      );

      // 検証
      // 他クライアントからも読める形式であることを、Node の標準実装と突き合わせます。
      expect(kv.store.get(`unikvs:${key}`)).toBe(Buffer.from(data).toString("base64"));
      await expect(
        storage.read(createGetContext(key, { signal: freshSignal() }) as IStorage.ReadContext),
      ).resolves.toStrictEqual(data);
    }
  });

  test("存在しないキーの読み取りは KeyNotFoundError になる", async ({ expect }) => {
    // 準備
    const storage = new VercelKv({ kv: new FakeKv() });

    // 実行
    const error = await captureRejection(
      storage.read(
        createGetContext("missing.bin", {
          signal: freshSignal(),
        }) as IStorage.ReadContext,
      ),
    );

    // 検証
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect((error as { message: string }).message).toBe("Key not found: missing.bin");
  });

  test("存在しないキーの exists は false になる", async ({ expect }) => {
    // 準備
    const storage = new VercelKv({ kv: new FakeKv() });

    // 実行と検証
    await expect(
      storage.exists(
        createHasContext("missing.bin", {
          signal: freshSignal(),
        }) as IStorage.ExistsContext,
      ),
    ).resolves.toBe(false);
  });

  test("文字列でない値が格納されていると読み取りは失敗する", async ({ expect }) => {
    // 準備
    const broken: KVClientLike = {
      get: async <T>(): Promise<T | null> => 123 as unknown as T,
      set: async () => "OK",
      del: async () => 0,
      exists: async () => 0,
      keys: async () => [],
    };
    const storage = new VercelKv({ kv: broken });

    // 実行
    const error = await captureRejection(
      storage.read(createGetContext("k", { signal: freshSignal() }) as IStorage.ReadContext),
    );

    // 検証
    expect(error).toBeInstanceOf(Error);
    expect((error as { message: string }).message).toContain("unexpected value type");
  });

  test("削除を 2 回行っても 2 回目はエラーにならない", async ({ expect }) => {
    // 準備
    const storage = new VercelKv({ kv: new FakeKv() });
    await storage.write(
      createSetContext("delete-twice.bin", { signal: freshSignal() }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await storage.delete(
      createDeleteContext("delete-twice.bin", { signal: freshSignal() }) as IStorage.DeleteContext,
    );

    // 実行と検証
    await expect(
      storage.delete(
        createDeleteContext("delete-twice.bin", {
          signal: freshSignal(),
        }) as IStorage.DeleteContext,
      ),
    ).resolves.toBeUndefined();
    await expect(
      storage.exists(
        createHasContext("delete-twice.bin", {
          signal: freshSignal(),
        }) as IStorage.ExistsContext,
      ),
    ).resolves.toBe(false);
  });

  test("上書きで長さが短くなっても古いデータが残らない", async ({ expect }) => {
    // 準備
    const storage = new VercelKv({ kv: new FakeKv() });
    await storage.write(
      createSetContext("shrink.bin", { signal: freshSignal() }) as IStorage.WriteContext,
      createAllByteValues(1024),
    );

    // 実行
    await storage.write(
      createSetContext("shrink.bin", { signal: freshSignal() }) as IStorage.WriteContext,
      new Uint8Array([1, 2, 3]),
    );

    // 検証
    await expect(
      storage.read(
        createGetContext("shrink.bin", {
          signal: freshSignal(),
        }) as IStorage.ReadContext,
      ),
    ).resolves.toStrictEqual(new Uint8Array([1, 2, 3]));
  });

  test("1 つのキーを削除しても他のキーは残る", async ({ expect }) => {
    // 準備
    const storage = new VercelKv({ kv: new FakeKv() });
    await storage.write(
      createSetContext("keep-a.bin", { signal: freshSignal() }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await storage.write(
      createSetContext("remove.bin", { signal: freshSignal() }) as IStorage.WriteContext,
      new Uint8Array([2]),
    );
    await storage.write(
      createSetContext("keep-b.bin", { signal: freshSignal() }) as IStorage.WriteContext,
      new Uint8Array([3]),
    );

    // 実行
    await storage.delete(
      createDeleteContext("remove.bin", { signal: freshSignal() }) as IStorage.DeleteContext,
    );

    // 検証
    await expect(
      storage.exists(
        createHasContext("keep-a.bin", {
          signal: freshSignal(),
        }) as IStorage.ExistsContext,
      ),
    ).resolves.toBe(true);
    await expect(
      storage.exists(
        createHasContext("remove.bin", {
          signal: freshSignal(),
        }) as IStorage.ExistsContext,
      ),
    ).resolves.toBe(false);
    await expect(
      storage.exists(
        createHasContext("keep-b.bin", {
          signal: freshSignal(),
        }) as IStorage.ExistsContext,
      ),
    ).resolves.toBe(true);
  });

  test("中断済みシグナルの操作は開始前に拒否され、副作用を残さない", async ({ expect }) => {
    // 準備
    const kv = new FakeKv();
    const storage = new VercelKv({ kv });
    await storage.write(
      createSetContext("kept.bin", { signal: freshSignal() }) as IStorage.WriteContext,
      new Uint8Array([9]),
    );

    // 実行と検証
    await expect(
      storage.write(
        createSetContext("new.bin", { signal: abortedSignal() }) as IStorage.WriteContext,
        new Uint8Array([1]),
      ),
    ).rejects.toBeInstanceOf(DOMException);
    await expect(
      storage.read(
        createGetContext("kept.bin", { signal: abortedSignal() }) as IStorage.ReadContext,
      ),
    ).rejects.toBeInstanceOf(DOMException);
    await expect(
      storage.exists(
        createHasContext("kept.bin", { signal: abortedSignal() }) as IStorage.ExistsContext,
      ),
    ).rejects.toBeInstanceOf(DOMException);
    await expect(
      storage.delete(
        createDeleteContext("kept.bin", { signal: abortedSignal() }) as IStorage.DeleteContext,
      ),
    ).rejects.toBeInstanceOf(DOMException);
    await expect(
      storage.clear(createClearContext("", { signal: abortedSignal() }) as IStorage.ClearContext),
    ).rejects.toBeInstanceOf(DOMException);
    expect([...kv.store.keys()]).toStrictEqual(["unikvs:kept.bin"]);
  });
});

describe("キー空間の分離", () => {
  test("keyPrefix が異なれば同じ論理キーでも干渉しない", async ({ expect }) => {
    // 準備
    const kv = new FakeKv();
    const storageA = new VercelKv({ kv, keyPrefix: "a:" });
    const storageB = new VercelKv({ kv, keyPrefix: "b:" });
    await storageA.write(
      createSetContext("data.bin", { signal: freshSignal() }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 実行と検証
    await expect(
      storageB.exists(
        createHasContext("data.bin", {
          signal: freshSignal(),
        }) as IStorage.ExistsContext,
      ),
    ).resolves.toBe(false);
    expect([...kv.store.keys()]).toStrictEqual(["a:data.bin"]);
  });

  test("clear は同じ keyPrefix のキーのみ削除する", async ({ expect }) => {
    // 準備
    const kv = new FakeKv();
    const storage = new VercelKv({ kv, keyPrefix: "target:" });
    const other = new VercelKv({ kv, keyPrefix: "other:" });
    await storage.write(
      createSetContext("before-clear-1.bin", { signal: freshSignal() }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await storage.write(
      createSetContext("before-clear-2.bin", { signal: freshSignal() }) as IStorage.WriteContext,
      new Uint8Array([2]),
    );
    await other.write(
      createSetContext("untouched.bin", { signal: freshSignal() }) as IStorage.WriteContext,
      new Uint8Array([9]),
    );

    // 実行
    await storage.clear(createClearContext("", { signal: freshSignal() }) as IStorage.ClearContext);

    // 検証
    expect([...kv.store.keys()]).toStrictEqual(["other:untouched.bin"]);
    await storage.write(
      createSetContext("after-clear.bin", { signal: freshSignal() }) as IStorage.WriteContext,
      new Uint8Array([3]),
    );
    await expect(
      storage.read(
        createGetContext("after-clear.bin", { signal: freshSignal() }) as IStorage.ReadContext,
      ),
    ).resolves.toStrictEqual(new Uint8Array([3]));
  });

  test("空のストアに対する clear は成功する", async ({ expect }) => {
    // 準備
    const kv = new FakeKv();
    const storage = new VercelKv({ kv });

    // 実行と検証
    await expect(
      storage.clear(createClearContext("", { signal: freshSignal() }) as IStorage.ClearContext),
    ).resolves.toBeUndefined();
  });

  test("空の keyPrefix での clear は拒否される", async ({ expect }) => {
    // 準備
    const storage = new VercelKv({ kv: new FakeKv(), keyPrefix: "" });

    // 実行
    const error = await captureRejection(
      storage.clear(createClearContext("", { signal: freshSignal() }) as IStorage.ClearContext),
    );

    // 検証
    expect(error).toBeInstanceOf(ClearWithoutPrefixNotAllowedError);
  });

  test("KEYS が想定外の形状を返すと clear は失敗する", async ({ expect }) => {
    // 準備
    const broken: KVClientLike = {
      get: async <T>(): Promise<T | null> => null as unknown as T,
      set: async () => "OK",
      del: async () => 0,
      exists: async () => 0,
      keys: async () => [123] as unknown as string[],
    };
    const storage = new VercelKv({ kv: broken });

    // 実行
    const error = await captureRejection(
      storage.clear(createClearContext("", { signal: freshSignal() }) as IStorage.ClearContext),
    );

    // 検証
    expect(error).toBeInstanceOf(Error);
    expect((error as { message: string }).message).toContain("unexpected KEYS result");
  });
});

describe("有効期限 (ttlSeconds)", () => {
  test("ttlSeconds を指定すると SET に ex 付きで渡される", async ({ expect }) => {
    // 準備
    const kv = new FakeKv();
    const storage = new VercelKv({ kv, ttlSeconds: 60 });

    // 実行
    await storage.write(
      createSetContext("ttl.bin", { signal: freshSignal() }) as IStorage.WriteContext,
      new Uint8Array([7]),
    );

    // 検証
    expect(kv.setCalls).toStrictEqual([
      { key: "unikvs:ttl.bin", value: kv.setCalls[0]!.value, options: { ex: 60 } },
    ]);
  });

  test("ttlSeconds を省略するとオプションなしで SET される", async ({ expect }) => {
    // 準備
    const kv = new FakeKv();
    const storage = new VercelKv({ kv });

    // 実行
    await storage.write(
      createSetContext("no-ttl.bin", { signal: freshSignal() }) as IStorage.WriteContext,
      new Uint8Array([7]),
    );

    // 検証
    expect(kv.setCalls[0]!.options).toBeUndefined();
  });

  test("不正な ttlSeconds は構築時に拒否される", ({ expect }) => {
    // 準備
    const invalidValues: unknown[] = [0, -1, 1.5, Number.NaN, "60", null];

    // 実行と検証
    for (const actual of invalidValues) {
      expect(() => new VercelKv({ kv: new FakeKv(), ttlSeconds: actual as number })).toThrow(
        InvalidTtlSecondsError,
      );
    }
  });
});

describe("クライアント解決", () => {
  test("kv・url・token・環境変数がなければ ClientNotAvailableError になる", async ({ expect }) => {
    // 準備
    vi.stubEnv("KV_REST_API_URL", undefined);
    vi.stubEnv("KV_REST_API_TOKEN", undefined);
    stubKvModule(() => new FakeKv());
    const storage = new VercelKv();

    // 実行
    const error = await captureRejection(
      storage.read(createGetContext("k", { signal: freshSignal() }) as IStorage.ReadContext),
    );

    // 検証
    expect(error).toBeInstanceOf(ClientNotAvailableError);
    expect(kvModule.createClientCalls).toStrictEqual([]);
  });

  test("url と token からクライアントを 1 度だけ生成して再利用する", async ({ expect }) => {
    // 準備
    const kv = new FakeKv();
    stubKvModule(() => kv);
    const storage = new VercelKv({ url: "https://kv.example", token: "secret" });

    // 実行
    await storage.write(
      createSetContext("a.bin", { signal: freshSignal() }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await storage.write(
      createSetContext("b.bin", { signal: freshSignal() }) as IStorage.WriteContext,
      new Uint8Array([2]),
    );
    await storage.read(
      createGetContext("a.bin", { signal: freshSignal() }) as IStorage.ReadContext,
    );

    // 検証
    expect(kvModule.createClientCalls).toStrictEqual([
      { url: "https://kv.example", token: "secret" },
    ]);
    expect([...kv.store.keys()]).toStrictEqual(["unikvs:a.bin", "unikvs:b.bin"]);
  });

  test("url と token を省略すると環境変数からクライアントを生成する", async ({ expect }) => {
    // 準備
    vi.stubEnv("KV_REST_API_URL", "https://env.example");
    vi.stubEnv("KV_REST_API_TOKEN", "env-secret");
    stubKvModule(() => new FakeKv());
    const storage = new VercelKv();

    // 実行
    await storage.exists(
      createHasContext("k", { signal: freshSignal() }) as IStorage.ExistsContext,
    );

    // 検証
    expect(kvModule.createClientCalls).toStrictEqual([
      { url: "https://env.example", token: "env-secret" },
    ]);
  });

  test("明示した url と token は環境変数より優先される", async ({ expect }) => {
    // 準備
    vi.stubEnv("KV_REST_API_URL", "https://env.example");
    vi.stubEnv("KV_REST_API_TOKEN", "env-secret");
    stubKvModule(() => new FakeKv());
    const storage = new VercelKv({
      url: "https://explicit.example",
      token: "explicit-secret",
    });

    // 実行
    await storage.exists(
      createHasContext("k", { signal: freshSignal() }) as IStorage.ExistsContext,
    );

    // 検証
    expect(kvModule.createClientCalls).toStrictEqual([
      { url: "https://explicit.example", token: "explicit-secret" },
    ]);
  });

  test("kv を注入したときはクライアントを生成しない", async ({ expect }) => {
    // 準備
    const kv = new FakeKv();
    stubKvModule(() => new FakeKv());
    const storage = new VercelKv({ kv, url: "https://kv.example", token: "secret" });

    // 実行
    await storage.write(
      createSetContext("k", { signal: freshSignal() }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 検証
    expect(kvModule.createClientCalls).toStrictEqual([]);
    expect([...kv.store.keys()]).toStrictEqual(["unikvs:k"]);
  });

  test("モジュールに createClient がなければ ClientNotAvailableError になる", async ({
    expect,
  }) => {
    // 準備
    // beforeEach で `@vercel/kv` の createClient は未定義に戻されています。
    const storage = new VercelKv({ url: "https://kv.example", token: "secret" });

    // 実行
    const error = await captureRejection(
      storage.read(createGetContext("k", { signal: freshSignal() }) as IStorage.ReadContext),
    );

    // 検証
    expect(error).toBeInstanceOf(ClientNotAvailableError);
  });
});
