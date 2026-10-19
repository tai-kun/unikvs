import type { IStorage } from "@unikvs/core";
import {
  abortedSignal,
  captureRejection,
  createClearContext,
  createCloseContext,
  createDeleteContext,
  createGetContext,
  createHasContext,
  createOpenContext,
  createSetContext,
} from "@unikvs/testing";
import { describe, test } from "vitest";

import CloudflareKv, { type KVNamespaceLike } from "../src/cloudflare-kv.js";
import {
  InvalidBindingError,
  InvalidKeyPrefixError,
  InvalidTtlSecondsError,
  KeyNotFoundError,
} from "../src/errors.js";
import { FakeKVNamespace, setup, setupWith } from "./_helpers.js";

describe("初期化と接続管理", () => {
  test("名前は CloudflareKv である", ({ expect }) => {
    // 準備
    const { storage } = setup();

    // 実行と検証
    expect(storage.name).toBe("CloudflareKv");
  });

  test("初期状態のとき、isOpen は true である", ({ expect }) => {
    // 準備
    const { storage } = setup();

    // 実行と検証
    expect(storage.isOpen).toBe(true);
  });

  test("open と close は何もせず成功する", async ({ expect }) => {
    // 準備
    const { storage } = setup();

    // 実行
    await storage.open(
      createOpenContext({ signal: AbortSignal.timeout(5_000) }) as IStorage.OpenContext,
    );
    await storage.close(
      createCloseContext({ signal: AbortSignal.timeout(5_000) }) as IStorage.CloseContext,
    );

    // 検証
    expect(storage.isOpen).toBe(true);
  });

  test("操作のあとも isOpen は true のままである", async ({ expect }) => {
    // 準備
    const { storage } = setup();

    // 実行
    await storage.write(
      createSetContext("k1", { signal: AbortSignal.timeout(5_000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 検証
    expect(storage.isOpen).toBe(true);
  });

  test("binding なしでは組み立てられない", ({ expect }) => {
    // 実行と検証
    expect(() => new CloudflareKv({ binding: undefined as never })).toThrow(InvalidBindingError);
    expect(() => new CloudflareKv({ binding: null as never })).toThrow(InvalidBindingError);
    expect(() => new CloudflareKv({ binding: "ns" as never })).toThrow(InvalidBindingError);
    expect(() => new CloudflareKv(null as never)).toThrow(InvalidBindingError);
    expect(() => new CloudflareKv("ns" as never)).toThrow(InvalidBindingError);
  });

  test("get/put/delete/list を欠く binding では組み立てられない", ({ expect }) => {
    // 準備
    const valid = new FakeKVNamespace();
    const bound: KVNamespaceLike = {
      get: (key: string, type: "arrayBuffer" | { readonly type: "arrayBuffer" }) =>
        valid.get(key, type),
      put: (key, value, options) => valid.put(key, value, options),
      delete: (key) => valid.delete(key),
      list: (options) => valid.list(options),
    };

    // 実行と検証
    expect(() => new CloudflareKv({ binding: {} as never })).toThrow(InvalidBindingError);
    expect(() => new CloudflareKv({ binding: { ...bound, get: undefined } as never })).toThrow(
      InvalidBindingError,
    );
    expect(() => new CloudflareKv({ binding: { ...bound, put: undefined } as never })).toThrow(
      InvalidBindingError,
    );
    expect(() => new CloudflareKv({ binding: { ...bound, delete: undefined } as never })).toThrow(
      InvalidBindingError,
    );
    expect(() => new CloudflareKv({ binding: { ...bound, list: undefined } as never })).toThrow(
      InvalidBindingError,
    );
  });

  test("文字列でない keyPrefix では組み立てられない", ({ expect }) => {
    // 実行と検証
    expect(() => setupWith({ keyPrefix: 42 as never }).storage).toThrow(InvalidKeyPrefixError);
  });

  test("正でない整数の ttlSeconds では組み立てられない", ({ expect }) => {
    // 実行と検証
    expect(() => setupWith({ ttlSeconds: "60" as never }).storage).toThrow(InvalidTtlSecondsError);
    expect(() => setupWith({ ttlSeconds: 1.5 }).storage).toThrow(InvalidTtlSecondsError);
    expect(() => setupWith({ ttlSeconds: 0 }).storage).toThrow(InvalidTtlSecondsError);
    expect(() => setupWith({ ttlSeconds: -60 }).storage).toThrow(InvalidTtlSecondsError);
    expect(() => setupWith({ ttlSeconds: Number.NaN }).storage).toThrow(InvalidTtlSecondsError);
  });

  test("中断済みシグナルでの open は中断例外を投げる", async ({ expect }) => {
    // 準備
    const { storage } = setup();

    // 実行
    const error = await captureRejection(
      storage.open(createOpenContext({ signal: abortedSignal() }) as IStorage.OpenContext),
    );

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("AbortError");
  });
});

describe("基本操作（CRUD）", () => {
  test("データを保存したとき、そのキーでデータを取得できる", async ({ expect }) => {
    // 準備
    const { storage } = setup();

    // 実行
    await storage.write(
      createSetContext("k1", { signal: AbortSignal.timeout(5_000) }) as IStorage.WriteContext,
      new Uint8Array([1, 2, 3]),
    );
    const result = await storage.read(
      createGetContext("k1", { signal: AbortSignal.timeout(5_000) }) as IStorage.ReadContext,
    );

    // 検証
    expect(result).toStrictEqual(new Uint8Array([1, 2, 3]));
  });

  test("保存したキーは接頭辞付きで binding に届く", async ({ expect }) => {
    // 準備
    const { binding, storage } = setup();

    // 実行
    await storage.write(
      createSetContext("k1", { signal: AbortSignal.timeout(5_000) }) as IStorage.WriteContext,
      new Uint8Array([9]),
    );

    // 検証
    expect(binding.store.has("unikvs:k1")).toBe(true);
    expect(new Uint8Array(binding.store.get("unikvs:k1")!)).toStrictEqual(new Uint8Array([9]));
  });

  test("独自の keyPrefix を使える", async ({ expect }) => {
    // 準備
    const { binding, storage } = setupWith({ keyPrefix: "app:" });

    // 実行
    await storage.write(
      createSetContext("k1", { signal: AbortSignal.timeout(5_000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    const result = await storage.read(
      createGetContext("k1", { signal: AbortSignal.timeout(5_000) }) as IStorage.ReadContext,
    );

    // 検証
    expect(result).toStrictEqual(new Uint8Array([1]));
    expect(binding.store.has("app:k1")).toBe(true);
  });

  test("ttlSeconds を指定したとき、expirationTtl として binding に届く", async ({ expect }) => {
    // 準備
    const { binding, storage } = setupWith({ ttlSeconds: 3_600 });

    // 実行
    await storage.write(
      createSetContext("k1", { signal: AbortSignal.timeout(5_000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 検証
    expect(binding.puts).toHaveLength(1);
    expect(binding.puts[0]).toMatchObject({
      key: "unikvs:k1",
      options: { expirationTtl: 3_600 },
    });
  });

  test("ttlSeconds 未指定のとき、put に期限を渡さない", async ({ expect }) => {
    // 準備
    const { binding, storage } = setup();

    // 実行
    await storage.write(
      createSetContext("k1", { signal: AbortSignal.timeout(5_000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 検証
    expect(binding.puts).toHaveLength(1);
    expect(binding.puts[0]?.options).toBeUndefined();
  });

  test("データが存在するとき、exists が true を返す", async ({ expect }) => {
    // 準備
    const { storage } = setup();
    await storage.write(
      createSetContext("k1", { signal: AbortSignal.timeout(5_000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 実行
    const result = await storage.exists(
      createHasContext("k1", { signal: AbortSignal.timeout(5_000) }) as IStorage.ExistsContext,
    );

    // 検証
    expect(result).toBe(true);
  });

  test("データが存在しないとき、exists が false を返す", async ({ expect }) => {
    // 準備
    const { storage } = setup();

    // 実行
    const result = await storage.exists(
      createHasContext("none", { signal: AbortSignal.timeout(5_000) }) as IStorage.ExistsContext,
    );

    // 検証
    expect(result).toBe(false);
  });

  test("データを削除したとき、そのデータが存在しなくなる", async ({ expect }) => {
    // 準備
    const { storage } = setup();
    await storage.write(
      createSetContext("k1", { signal: AbortSignal.timeout(5_000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 実行
    await storage.delete(
      createDeleteContext("k1", { signal: AbortSignal.timeout(5_000) }) as IStorage.DeleteContext,
    );

    // 検証
    expect(
      await storage.exists(
        createHasContext("k1", { signal: AbortSignal.timeout(5_000) }) as IStorage.ExistsContext,
      ),
    ).toBe(false);
  });

  test("存在しないキーを削除しても成功する", async ({ expect }) => {
    // 準備
    const { storage } = setup();

    // 実行と検証
    await expect(
      storage.delete(
        createDeleteContext("none", {
          signal: AbortSignal.timeout(5_000),
        }) as IStorage.DeleteContext,
      ),
    ).resolves.toBeUndefined();
  });

  test("存在しないキーの read は KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備
    const { storage } = setup();

    // 実行
    const error = await captureRejection(
      storage.read(
        createGetContext("unknown", { signal: AbortSignal.timeout(5_000) }) as IStorage.ReadContext,
      ),
    );

    // 検証
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect((error as KeyNotFoundError).meta).toStrictEqual({ key: "unknown" });
  });

  test("中断済みシグナルでの read は中断例外を投げる", async ({ expect }) => {
    // 準備
    const { storage } = setup();

    // 実行
    const error = await captureRejection(
      storage.read(createGetContext("k1", { signal: abortedSignal() }) as IStorage.ReadContext),
    );

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("AbortError");
  });
});

describe("バイナリーの往復", () => {
  test("全 256 バイト値を保存したとき、byte-for-byte で一致する", async ({ expect }) => {
    // 準備
    const { storage } = setup();
    const data = new Uint8Array(256);

    for (let i = 0; i < 256; i += 1) {
      data[i] = i;
    }

    // 実行
    await storage.write(
      createSetContext("all", { signal: AbortSignal.timeout(5_000) }) as IStorage.WriteContext,
      data,
    );
    const result = await storage.read(
      createGetContext("all", { signal: AbortSignal.timeout(5_000) }) as IStorage.ReadContext,
    );

    // 検証
    expect(result).toStrictEqual(data);
  });

  test("0 バイトの値を保存したとき、exists は true を返す", async ({ expect }) => {
    // 準備
    const { storage } = setup();

    // 実行
    await storage.write(
      createSetContext("empty", { signal: AbortSignal.timeout(5_000) }) as IStorage.WriteContext,
      new Uint8Array(0),
    );

    // 検証
    expect(
      await storage.exists(
        createHasContext("empty", { signal: AbortSignal.timeout(5_000) }) as IStorage.ExistsContext,
      ),
    ).toBe(true);
    expect(
      await storage.read(
        createGetContext("empty", {
          signal: AbortSignal.timeout(5_000),
        }) as IStorage.ReadContext,
      ),
    ).toStrictEqual(new Uint8Array(0));
  });

  test("既存のキーに書き込んだとき、長さが変わっても値が更新される", async ({ expect }) => {
    // 準備
    const { storage } = setup();
    await storage.write(
      createSetContext("k1", { signal: AbortSignal.timeout(5_000) }) as IStorage.WriteContext,
      new Uint8Array([1, 2, 3, 4]),
    );

    // 実行
    await storage.write(
      createSetContext("k1", { signal: AbortSignal.timeout(5_000) }) as IStorage.WriteContext,
      new Uint8Array([9]),
    );

    // 検証
    expect(
      await storage.read(
        createGetContext("k1", { signal: AbortSignal.timeout(5_000) }) as IStorage.ReadContext,
      ),
    ).toStrictEqual(new Uint8Array([9]));
  });
});

describe("全削除（clear）", () => {
  test("全データを消去したとき、すべてのキーが存在しなくなる", async ({ expect }) => {
    // 準備
    const { storage } = setup();
    await storage.write(
      createSetContext("k1", { signal: AbortSignal.timeout(5_000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await storage.write(
      createSetContext("k2", { signal: AbortSignal.timeout(5_000) }) as IStorage.WriteContext,
      new Uint8Array([2]),
    );

    // 実行
    await storage.clear(
      createClearContext("", { signal: AbortSignal.timeout(5_000) }) as IStorage.ClearContext,
    );

    // 検証
    expect(
      await storage.exists(
        createHasContext("k1", { signal: AbortSignal.timeout(5_000) }) as IStorage.ExistsContext,
      ),
    ).toBe(false);
    expect(
      await storage.exists(
        createHasContext("k2", { signal: AbortSignal.timeout(5_000) }) as IStorage.ExistsContext,
      ),
    ).toBe(false);
  });

  test("接頭辞の外側のキーは消去されない", async ({ expect }) => {
    // 準備
    const { binding, storage } = setup();
    binding.store.set("other:k9", new Uint8Array([9]).buffer as ArrayBuffer);
    await storage.write(
      createSetContext("k1", { signal: AbortSignal.timeout(5_000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 実行
    await storage.clear(
      createClearContext("", { signal: AbortSignal.timeout(5_000) }) as IStorage.ClearContext,
    );

    // 検証
    expect(binding.store.has("other:k9")).toBe(true);
    expect(binding.store.has("unikvs:k1")).toBe(false);
  });

  test("list が複数ページに分かれてもすべて消去される", async ({ expect }) => {
    // 準備
    const { binding, storage } = setup();
    binding.pageSize = 2;

    for (let i = 0; i < 5; i += 1) {
      await storage.write(
        createSetContext(`k${i}`, {
          signal: AbortSignal.timeout(5_000),
        }) as IStorage.WriteContext,
        new Uint8Array([i]),
      );
    }

    // 実行
    await storage.clear(
      createClearContext("", { signal: AbortSignal.timeout(5_000) }) as IStorage.ClearContext,
    );

    // 検証
    expect(binding.store.size).toBe(0);
    expect(binding.deletes).toHaveLength(5);
  });

  test("中断済みシグナルでの clear は中断例外を投げる", async ({ expect }) => {
    // 準備
    const { storage } = setup();

    // 実行
    const error = await captureRejection(
      storage.clear(createClearContext("", { signal: abortedSignal() }) as IStorage.ClearContext),
    );

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("AbortError");
  });
});
