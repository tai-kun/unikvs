import type { IStorage } from "@unikvs/core";
import {
  abortedSignal,
  captureRejection,
  createGetContext,
  createHasContext,
  createSetContext,
  createOpenContext,
  createClearContext,
  createCloseContext,
  createDeleteContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import CloudflareKv, { type KVNamespaceLike } from "../src/cloudflare-kv.js";
import {
  KeyNotFoundError,
  InvalidBindingError,
  InvalidKeyPrefixError,
  InvalidTtlSecondsError,
} from "../src/errors.js";
import { setup, setupWith, FakeKVNamespace } from "./_helpers.js";

describe("初期化と接続管理", () => {
  test("名前は CloudflareKv である", ({ expect }) => {
    // 準備：
    const { storage } = setup();

    // 実行と検証：
    expect(storage.name).toBe("CloudflareKv");
  });

  test("初期状態のとき、isOpen は true である", ({ expect }) => {
    // 準備：
    const { storage } = setup();

    // 実行と検証：
    expect(storage.isOpen).toBe(true);
  });

  test("open と close は何もせず成功する", async ({ expect }) => {
    // 準備：
    const { storage } = setup();

    // 実行：
    await storage.open(
      createOpenContext({ signal: AbortSignal.timeout(5000) }) as IStorage.OpenContext,
    );
    await storage.close(
      createCloseContext({ signal: AbortSignal.timeout(5000) }) as IStorage.CloseContext,
    );

    // 検証：
    expect(storage.isOpen).toBe(true);
  });

  test("binding なしでは組み立てられない", ({ expect }) => {
    // 実行と検証：
    expect(() => new CloudflareKv({ binding: undefined as never })).toThrow(InvalidBindingError);
    expect(() => new CloudflareKv({ binding: null as never })).toThrow(InvalidBindingError);
    expect(() => new CloudflareKv({ binding: "ns" as never })).toThrow(InvalidBindingError);
    expect(() => new CloudflareKv(null as never)).toThrow(InvalidBindingError);
    expect(() => new CloudflareKv("ns" as never)).toThrow(InvalidBindingError);
  });

  test("get/put/delete/list を欠く binding では組み立てられない", ({ expect }) => {
    // 準備：
    const valid = new FakeKVNamespace();
    const bound: KVNamespaceLike = {
      get: (key: string, type: "arrayBuffer" | { readonly type: "arrayBuffer" }) =>
        valid.get(key, type),
      put: (key, value, options) => valid.put(key, value, options),
      list: (options) => valid.list(options),
      delete: (key) => valid.delete(key),
    };

    // 実行と検証：
    expect(() => new CloudflareKv({ binding: {} as never })).toThrow(InvalidBindingError);
    expect(
      () =>
        new CloudflareKv({
          binding: {
            ...bound,
            get: undefined,
          } as never,
        }),
    ).toThrow(InvalidBindingError);
    expect(
      () =>
        new CloudflareKv({
          binding: {
            ...bound,
            put: undefined,
          } as never,
        }),
    ).toThrow(InvalidBindingError);
    expect(
      () =>
        new CloudflareKv({
          binding: {
            ...bound,
            delete: undefined,
          } as never,
        }),
    ).toThrow(InvalidBindingError);
    expect(
      () =>
        new CloudflareKv({
          binding: {
            ...bound,
            list: undefined,
          } as never,
        }),
    ).toThrow(InvalidBindingError);
  });

  test("文字列でない keyPrefix では組み立てられない", ({ expect }) => {
    // 実行と検証：
    expect(() => setupWith({ keyPrefix: 42 as never }).storage).toThrow(InvalidKeyPrefixError);
  });

  test("正でない整数の ttlSeconds では組み立てられない", ({ expect }) => {
    // 実行と検証：
    expect(() => setupWith({ ttlSeconds: "60" as never }).storage).toThrow(InvalidTtlSecondsError);
    expect(() => setupWith({ ttlSeconds: 1.5 }).storage).toThrow(InvalidTtlSecondsError);
    expect(() => setupWith({ ttlSeconds: 0 }).storage).toThrow(InvalidTtlSecondsError);
    expect(() => setupWith({ ttlSeconds: -60 }).storage).toThrow(InvalidTtlSecondsError);
    expect(() => setupWith({ ttlSeconds: Number.NaN }).storage).toThrow(InvalidTtlSecondsError);
  });
});

describe("中断", () => {
  test("中断済みシグナルの各操作は binding を呼び出さずに拒否される", async ({ expect }) => {
    // 準備：
    const { binding, storage } = setup();
    const signal = abortedSignal();
    const cases: [string, () => Promise<unknown>][] = [
      ["open", () => storage.open(createOpenContext({ signal }) as IStorage.OpenContext)],
      ["close", () => storage.close(createCloseContext({ signal }) as IStorage.CloseContext)],
      [
        "write",
        () =>
          storage.write(
            createSetContext("k1", { signal }) as IStorage.WriteContext,
            new Uint8Array([1]),
          ),
      ],
      ["read", () => storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext)],
      [
        "exists",
        () => storage.exists(createHasContext("k1", { signal }) as IStorage.ExistsContext),
      ],
      [
        "delete",
        () => storage.delete(createDeleteContext("k1", { signal }) as IStorage.DeleteContext),
      ],
      ["clear", () => storage.clear(createClearContext("", { signal }) as IStorage.ClearContext)],
    ];

    // 実行と検証：
    for (const [label, run] of cases) {
      const error = await captureRejection(run());
      expect(error, label).toBeInstanceOf(DOMException);
      expect((error as DOMException).name, label).toBe("AbortError");
    }

    expect(binding.puts, "write は put を呼ばない").toStrictEqual([]);
    expect(binding.gets, "read と exists は get を呼ばない").toStrictEqual([]);
    expect(binding.deletes, "delete と clear は delete を呼ばない").toStrictEqual([]);
    expect(binding.lists, "clear は list を呼ばない").toStrictEqual([]);
    expect(binding.store.size, "どの操作も副作用を残さない").toBe(0);
  });
});

describe("基本操作（CRUD）", () => {
  test("データを保存したとき、そのキーでデータを取得できる", async ({ expect }) => {
    // 準備：
    const { storage } = setup();

    // 実行：
    await storage.write(
      createSetContext("k1", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([1, 2, 3]),
    );

    const result = await storage.read(
      createGetContext("k1", { signal: AbortSignal.timeout(5000) }) as IStorage.ReadContext,
    );

    // 検証：
    expect(result).toStrictEqual(new Uint8Array([1, 2, 3]));
  });

  test("キーは変換されず接頭辞と連結されて binding に届く", async ({ expect }) => {
    // 準備：
    const { binding, storage } = setup();
    const key = "a/b c:%2F";

    // 実行：
    await storage.write(
      createSetContext(key, { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([9]),
    );

    // 検証：
    expect(binding.store.has(`unikvs:${key}`)).toBe(true);

    const stored = binding.store.get(`unikvs:${key}`);
    expect(stored).not.toBeUndefined();
    expect(new Uint8Array(stored as ArrayBuffer)).toStrictEqual(new Uint8Array([9]));
  });

  test("独自の keyPrefix を使える", async ({ expect }) => {
    // 準備：
    const { binding, storage } = setupWith({ keyPrefix: "app:" });

    // 実行：
    await storage.write(
      createSetContext("k1", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    const result = await storage.read(
      createGetContext("k1", { signal: AbortSignal.timeout(5000) }) as IStorage.ReadContext,
    );

    // 検証：
    expect(result).toStrictEqual(new Uint8Array([1]));

    expect(binding.store.has("app:k1")).toBe(true);
  });

  test("ttlSeconds を指定したとき、expirationTtl として binding に届く", async ({ expect }) => {
    // 準備：
    const { binding, storage } = setupWith({ ttlSeconds: 3600 });

    // 実行：
    await storage.write(
      createSetContext("k1", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 検証：
    expect(binding.puts).toHaveLength(1);
    expect(binding.puts[0]).toMatchObject({
      key: "unikvs:k1",
      options: { expirationTtl: 3600 },
    });
  });

  test("ttlSeconds 未指定のとき、put に期限を渡さない", async ({ expect }) => {
    // 準備：
    const { binding, storage } = setup();

    // 実行：
    await storage.write(
      createSetContext("k1", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 検証：
    expect(binding.puts).toHaveLength(1);
    expect(binding.puts[0]?.options).toBeUndefined();
  });

  test("データが存在するとき、exists が true を返す", async ({ expect }) => {
    // 準備：
    const { storage } = setup();
    await storage.write(
      createSetContext("k1", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 実行：
    const result = await storage.exists(
      createHasContext("k1", { signal: AbortSignal.timeout(5000) }) as IStorage.ExistsContext,
    );

    // 検証：
    expect(result).toBe(true);
  });

  test("データが存在しないとき、exists が false を返す", async ({ expect }) => {
    // 準備：
    const { storage } = setup();

    // 実行：
    const result = await storage.exists(
      createHasContext("none", { signal: AbortSignal.timeout(5000) }) as IStorage.ExistsContext,
    );

    // 検証：
    expect(result).toBe(false);
  });

  test("データを削除したとき、そのデータだけが存在しなくなる", async ({ expect }) => {
    // 準備：
    const { storage } = setup();
    await storage.write(
      createSetContext("k1", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await storage.write(
      createSetContext("k2", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([2]),
    );

    // 実行：
    await storage.delete(
      createDeleteContext("k1", { signal: AbortSignal.timeout(5000) }) as IStorage.DeleteContext,
    );

    // 検証：
    expect(
      await storage.exists(
        createHasContext("k1", { signal: AbortSignal.timeout(5000) }) as IStorage.ExistsContext,
      ),
    ).toBe(false);
    expect(
      await storage.read(
        createGetContext("k2", { signal: AbortSignal.timeout(5000) }) as IStorage.ReadContext,
      ),
    ).toStrictEqual(new Uint8Array([2]));
  });

  test("存在しないキーを削除しても成功する", async ({ expect }) => {
    // 準備：
    const { storage } = setup();

    // 実行と検証：
    await expect(
      storage.delete(
        createDeleteContext("none", {
          signal: AbortSignal.timeout(5000),
        }) as IStorage.DeleteContext,
      ),
    ).resolves.toBeUndefined();
  });

  test("存在しないキーの read は KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備：
    const { storage } = setup();

    // 実行：
    const error = await captureRejection(
      storage.read(
        createGetContext("unknown", { signal: AbortSignal.timeout(5000) }) as IStorage.ReadContext,
      ),
    );

    // 検証：
    expect(error).toBeInstanceOf(KeyNotFoundError);
    expect((error as KeyNotFoundError).meta).toStrictEqual({ key: "unknown" });
  });
});

describe("バイナリーの往復", () => {
  test("全 256 バイト値を保存したとき、byte-for-byte で一致する", async ({ expect }) => {
    // 準備：
    const { storage } = setup();
    const data = new Uint8Array(256);

    for (let i = 0; i < 256; i += 1) {
      data[i] = i;
    }

    // 実行：
    await storage.write(
      createSetContext("all", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      data,
    );
    const result = await storage.read(
      createGetContext("all", { signal: AbortSignal.timeout(5000) }) as IStorage.ReadContext,
    );

    // 検証：
    expect(result).toStrictEqual(data);
  });

  test("ArrayBuffer の一部を指すビューを保存したとき、その範囲だけが保存される", async ({
    expect,
  }) => {
    // 準備：
    const { binding, storage } = setup();
    const backing = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
    const view = backing.subarray(2, 6);

    // 実行：
    await storage.write(
      createSetContext("view", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      view,
    );

    const result = await storage.read(
      createGetContext("view", { signal: AbortSignal.timeout(5000) }) as IStorage.ReadContext,
    );

    // 検証：
    const storedView = binding.store.get("unikvs:view");
    expect(storedView).not.toBeUndefined();
    expect(new Uint8Array(storedView as ArrayBuffer)).toStrictEqual(new Uint8Array([2, 3, 4, 5]));
    expect(result).toStrictEqual(new Uint8Array([2, 3, 4, 5]));
  });

  test("0 バイトの値を保存したとき、exists は true を返す", async ({ expect }) => {
    // 準備：
    const { storage } = setup();

    // 実行：
    await storage.write(
      createSetContext("empty", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array(0),
    );

    // 検証：
    expect(
      await storage.exists(
        createHasContext("empty", { signal: AbortSignal.timeout(5000) }) as IStorage.ExistsContext,
      ),
    ).toBe(true);
    expect(
      await storage.read(
        createGetContext("empty", {
          signal: AbortSignal.timeout(5000),
        }) as IStorage.ReadContext,
      ),
    ).toStrictEqual(new Uint8Array(0));
  });

  test("既存のキーに書き込んだとき、長さが変わっても値が更新される", async ({ expect }) => {
    // 準備：
    const { storage } = setup();
    await storage.write(
      createSetContext("k1", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([1, 2, 3, 4]),
    );

    // 実行：
    await storage.write(
      createSetContext("k1", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([9]),
    );

    // 検証：
    expect(
      await storage.read(
        createGetContext("k1", { signal: AbortSignal.timeout(5000) }) as IStorage.ReadContext,
      ),
    ).toStrictEqual(new Uint8Array([9]));
  });
});

describe("全削除（clear）", () => {
  test("全データを消去したとき、すべてのキーが存在しなくなる", async ({ expect }) => {
    // 準備：
    const { storage } = setup();
    await storage.write(
      createSetContext("k1", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await storage.write(
      createSetContext("k2", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([2]),
    );

    // 実行：
    await storage.clear(
      createClearContext("", { signal: AbortSignal.timeout(5000) }) as IStorage.ClearContext,
    );

    // 検証：
    expect(
      await storage.exists(
        createHasContext("k1", { signal: AbortSignal.timeout(5000) }) as IStorage.ExistsContext,
      ),
    ).toBe(false);
    expect(
      await storage.exists(
        createHasContext("k2", { signal: AbortSignal.timeout(5000) }) as IStorage.ExistsContext,
      ),
    ).toBe(false);
  });

  test("clear は独自の keyPrefix 配下だけを消去する", async ({ expect }) => {
    // 準備：
    const { binding, storage } = setupWith({ keyPrefix: "app:" });
    binding.store.set("other:k9", new Uint8Array([9]).buffer);
    await storage.write(
      createSetContext("k1", { signal: AbortSignal.timeout(5000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 実行：
    await storage.clear(
      createClearContext("", { signal: AbortSignal.timeout(5000) }) as IStorage.ClearContext,
    );

    // 検証：
    expect(binding.store.has("other:k9")).toBe(true);
    expect(binding.store.has("app:k1")).toBe(false);
  });

  test("list が複数ページに分かれてもすべて消去される", async ({ expect }) => {
    // 準備：
    const { binding, storage } = setup();
    binding.pageSize = 2;

    for (let i = 0; i < 5; i += 1) {
      await storage.write(
        createSetContext(`k${i}`, {
          signal: AbortSignal.timeout(5000),
        }) as IStorage.WriteContext,
        new Uint8Array([i]),
      );
    }

    // 実行：
    await storage.clear(
      createClearContext("", { signal: AbortSignal.timeout(5000) }) as IStorage.ClearContext,
    );

    // 検証：
    expect(binding.store.size).toBe(0);
    expect(binding.deletes).toHaveLength(5);
  });
});
