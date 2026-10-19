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
import { describe, test } from "vitest";

import {
  ClearWithoutPrefixNotAllowedError,
  ClientNotAvailableError,
  InvalidTtlSecondsError,
  KeyNotFoundError,
} from "../src/errors.js";
import VercelKv, { type KVClientLike } from "../src/vercel-kv.js";
import { FakeKv } from "./_helpers.js";

function freshSignal(): AbortSignal {
  return AbortSignal.timeout(5_000);
}

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

  test("値は Base64 文字列として格納される", async ({ expect }) => {
    // 準備
    const kv = new FakeKv();
    const storage = new VercelKv({ kv });
    const data = new TextEncoder().encode("こんにちは、世界! 🚀 Ω");

    // 実行
    await storage.write(
      createSetContext("unicode-data.txt", { signal: freshSignal() }) as IStorage.WriteContext,
      data,
    );

    // 検証
    const stored = kv.store.get("unikvs:unicode-data.txt");
    expect(typeof stored).toBe("string");
    expect(new TextDecoder().decode(new Uint8Array(Buffer.from(stored!, "base64")))).toBe(
      "こんにちは、世界! 🚀 Ω",
    );
    const result = await storage.read(
      createGetContext("unicode-data.txt", { signal: freshSignal() }) as IStorage.ReadContext,
    );
    expect(new TextDecoder().decode(result)).toBe("こんにちは、世界! 🚀 Ω");
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

  test("中断済みシグナルの操作は中断例外を投げる", async ({ expect }) => {
    // 準備
    const storage = new VercelKv({ kv: new FakeKv() });

    // 実行と検証
    await expect(
      storage.write(
        createSetContext("k", { signal: abortedSignal() }) as IStorage.WriteContext,
        new Uint8Array([1]),
      ),
    ).rejects.toBeInstanceOf(DOMException);
    await expect(
      storage.read(createGetContext("k", { signal: abortedSignal() }) as IStorage.ReadContext),
    ).rejects.toBeInstanceOf(DOMException);
    await expect(
      storage.exists(createHasContext("k", { signal: abortedSignal() }) as IStorage.ExistsContext),
    ).rejects.toBeInstanceOf(DOMException);
    await expect(
      storage.delete(
        createDeleteContext("k", { signal: abortedSignal() }) as IStorage.DeleteContext,
      ),
    ).rejects.toBeInstanceOf(DOMException);
    await expect(
      storage.clear(createClearContext("", { signal: abortedSignal() }) as IStorage.ClearContext),
    ).rejects.toBeInstanceOf(DOMException);
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
    const savedUrl = process.env["KV_REST_API_URL"];
    const savedToken = process.env["KV_REST_API_TOKEN"];
    delete process.env["KV_REST_API_URL"];
    delete process.env["KV_REST_API_TOKEN"];

    try {
      const storage = new VercelKv();

      // 実行
      const error = await captureRejection(
        storage.read(createGetContext("k", { signal: freshSignal() }) as IStorage.ReadContext),
      );

      // 検証
      expect(error).toBeInstanceOf(ClientNotAvailableError);
    } finally {
      if (savedUrl !== undefined) {
        process.env["KV_REST_API_URL"] = savedUrl;
      }

      if (savedToken !== undefined) {
        process.env["KV_REST_API_TOKEN"] = savedToken;
      }
    }
  });

  test("url と token があっても @vercel/kv がなければ ClientNotAvailableError になる", async ({
    expect,
  }) => {
    // 準備
    const storage = new VercelKv({ url: "https://example.com", token: "secret" });

    // 実行
    const error = await captureRejection(
      storage.read(createGetContext("k", { signal: freshSignal() }) as IStorage.ReadContext),
    );

    // 検証
    // `@vercel/kv` が任意依存のため、未導入環境では解決失敗、
    // 導入済み環境では到達不能な URL への接続失敗のいずれかになる。
    expect(error).toBeInstanceOf(Error);
  });
});
