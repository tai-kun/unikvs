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
  createStreamContext,
} from "@unikvs/testing";
import { describe, test } from "vitest";

import CloudflareCache from "../src/cloudflare-cache.js";
import {
  CacheBindingNotFoundError,
  CacheOperationError,
  ClearNotSupportedError,
  InvalidKeyError,
  InvalidOriginError,
  KeyNotFoundError,
} from "../src/errors.js";
import { createFakeCache } from "./_helpers.js";

describe("初期化と接続管理", () => {
  test("名前は CloudflareCache である", ({ expect }) => {
    // 準備
    const cache = createFakeCache();

    // 実行
    const storage = new CloudflareCache({ cache });

    // 検証
    expect(storage.name).toBe("CloudflareCache");
  });

  test("初期状態のとき、isOpen は true である", ({ expect }) => {
    // 準備
    const cache = createFakeCache();

    // 実行と検証
    expect(new CloudflareCache({ cache }).isOpen).toBe(true);
  });

  test("open と close は中断されなければ成功する", async ({ expect }) => {
    // 準備
    const storage = new CloudflareCache({ cache: createFakeCache() });

    // 実行と検証
    await expect(
      storage.open(
        createOpenContext({ signal: AbortSignal.timeout(5_000) }) as IStorage.OpenContext,
      ),
    ).resolves.toBeUndefined();
    await expect(
      storage.close(
        createCloseContext({ signal: AbortSignal.timeout(5_000) }) as IStorage.CloseContext,
      ),
    ).resolves.toBeUndefined();
    expect(storage.isOpen).toBe(true);
  });

  test("cache がなく caches.default もないとき、構築時に拒否する", ({ expect }) => {
    // 準備
    const original = (globalThis as { caches?: unknown }).caches;
    (globalThis as { caches?: unknown }).caches = undefined;

    try {
      // 実行
      const error = (() => {
        try {
          return new CloudflareCache();
        } catch (ex) {
          return ex;
        }
      })();

      // 検証
      expect(error).toBeInstanceOf(CacheBindingNotFoundError);
    } finally {
      (globalThis as { caches?: unknown }).caches = original;
    }
  });

  test("caches.default があるとき、cache 未指定でも使える", async ({ expect }) => {
    // 準備
    const fake = createFakeCache();
    const original = (globalThis as { caches?: unknown }).caches;
    (globalThis as { caches?: unknown }).caches = { default: fake };

    try {
      const storage = new CloudflareCache();

      // 実行
      await storage.write(
        createSetContext("k1", { signal: AbortSignal.timeout(5_000) }) as IStorage.WriteContext,
        new Uint8Array([1, 2, 3]),
      );

      // 検証
      expect(fake.store.size).toBe(1);
      expect(
        await storage.read(
          createGetContext("k1", { signal: AbortSignal.timeout(5_000) }) as IStorage.ReadContext,
        ),
      ).toStrictEqual(new Uint8Array([1, 2, 3]));
    } finally {
      (globalThis as { caches?: unknown }).caches = original;
    }
  });

  test("中断済みシグナルでの open は中断例外を投げる", async ({ expect }) => {
    // 準備
    const storage = new CloudflareCache({ cache: createFakeCache() });

    // 実行
    const error = await captureRejection(
      storage.open(createOpenContext({ signal: abortedSignal() }) as IStorage.OpenContext),
    );

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("AbortError");
  });

  test("中断済みシグナルでの close は中断例外を投げる", async ({ expect }) => {
    // 準備
    const storage = new CloudflareCache({ cache: createFakeCache() });

    // 実行
    const error = await captureRejection(
      storage.close(createCloseContext({ signal: abortedSignal() }) as IStorage.CloseContext),
    );

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("AbortError");
  });
});

describe("基本操作（CRUD）", () => {
  test("データを保存したとき、そのキーでデータを取得できる", async ({ expect }) => {
    // 準備
    const storage = new CloudflareCache({ cache: createFakeCache() });

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

  test("全 256 バイト値を含むデータを保存したとき、byte-for-byte で一致する", async ({
    expect,
  }) => {
    // 準備
    const storage = new CloudflareCache({ cache: createFakeCache() });
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

  test("0x00 と 0xff を含む値を保存したとき、そのまま取得できる", async ({ expect }) => {
    // 準備
    const storage = new CloudflareCache({ cache: createFakeCache() });

    // 実行
    await storage.write(
      createSetContext("edge", { signal: AbortSignal.timeout(5_000) }) as IStorage.WriteContext,
      new Uint8Array([0x00, 0xff, 0x00, 0xff]),
    );

    // 検証
    expect(
      await storage.read(
        createGetContext("edge", { signal: AbortSignal.timeout(5_000) }) as IStorage.ReadContext,
      ),
    ).toStrictEqual(new Uint8Array([0x00, 0xff, 0x00, 0xff]));
  });

  test("既存のキーに書き込んだとき、長さが変わっても値が更新される", async ({ expect }) => {
    // 準備
    const storage = new CloudflareCache({ cache: createFakeCache() });
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

  test("0 バイトの値を保存したとき、exists は true を返す", async ({ expect }) => {
    // 準備
    const storage = new CloudflareCache({ cache: createFakeCache() });

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
        createGetContext("empty", { signal: AbortSignal.timeout(5_000) }) as IStorage.ReadContext,
      ),
    ).toStrictEqual(new Uint8Array(0));
  });

  test("書き込み後に元の配列を変更しても保存値は変わらない", async ({ expect }) => {
    // 準備
    const storage = new CloudflareCache({ cache: createFakeCache() });
    const data = new Uint8Array([1, 2, 3]);

    // 実行
    await storage.write(
      createSetContext("k1", { signal: AbortSignal.timeout(5_000) }) as IStorage.WriteContext,
      data,
    );
    data[0] = 99;

    // 検証
    expect(
      await storage.read(
        createGetContext("k1", { signal: AbortSignal.timeout(5_000) }) as IStorage.ReadContext,
      ),
    ).toStrictEqual(new Uint8Array([1, 2, 3]));
  });

  test("存在しないキーの read は KeyNotFoundError を投げる", async ({ expect }) => {
    // 準備
    const storage = new CloudflareCache({ cache: createFakeCache() });

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

  test("存在しないキーの exists は false を返す", async ({ expect }) => {
    // 準備
    const storage = new CloudflareCache({ cache: createFakeCache() });

    // 実行
    const result = await storage.exists(
      createHasContext("unknown", { signal: AbortSignal.timeout(5_000) }) as IStorage.ExistsContext,
    );

    // 検証
    expect(result).toBe(false);
  });

  test("存在するキーの exists は true を返す", async ({ expect }) => {
    // 準備
    const storage = new CloudflareCache({ cache: createFakeCache() });
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

  test("削除したキーは取得できなくなる", async ({ expect }) => {
    // 準備
    const storage = new CloudflareCache({ cache: createFakeCache() });
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
    const error = await captureRejection(
      storage.read(
        createGetContext("k1", { signal: AbortSignal.timeout(5_000) }) as IStorage.ReadContext,
      ),
    );
    expect(error).toBeInstanceOf(KeyNotFoundError);
  });

  test("存在しないキーを削除しても成功する", async ({ expect }) => {
    // 準備
    const storage = new CloudflareCache({ cache: createFakeCache() });

    // 実行と検証
    await expect(
      storage.delete(
        createDeleteContext("none", {
          signal: AbortSignal.timeout(5_000),
        }) as IStorage.DeleteContext,
      ),
    ).resolves.toBeUndefined();
    expect(
      await storage.exists(
        createHasContext("none", { signal: AbortSignal.timeout(5_000) }) as IStorage.ExistsContext,
      ),
    ).toBe(false);
  });

  test("中断済みシグナルでの write は中断例外を投げる", async ({ expect }) => {
    // 準備
    const storage = new CloudflareCache({ cache: createFakeCache() });

    // 実行
    const error = await captureRejection(
      storage.write(
        createSetContext("k1", { signal: abortedSignal() }) as IStorage.WriteContext,
        new Uint8Array([1]),
      ),
    );

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("AbortError");
  });

  test("中断済みシグナルでの read は中断例外を投げる", async ({ expect }) => {
    // 準備
    const storage = new CloudflareCache({ cache: createFakeCache() });

    // 実行
    const error = await captureRejection(
      storage.read(createGetContext("k1", { signal: abortedSignal() }) as IStorage.ReadContext),
    );

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("AbortError");
  });

  test("中断済みシグナルでの exists は中断例外を投げる", async ({ expect }) => {
    // 準備
    const storage = new CloudflareCache({ cache: createFakeCache() });

    // 実行
    const error = await captureRejection(
      storage.exists(createHasContext("k1", { signal: abortedSignal() }) as IStorage.ExistsContext),
    );

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("AbortError");
  });

  test("中断済みシグナルでの delete は中断例外を投げる", async ({ expect }) => {
    // 準備
    const storage = new CloudflareCache({ cache: createFakeCache() });

    // 実行
    const error = await captureRejection(
      storage.delete(
        createDeleteContext("k1", { signal: abortedSignal() }) as IStorage.DeleteContext,
      ),
    );

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("AbortError");
  });
});

describe("キーと origin の対応", () => {
  test("既定の origin でキーに対応する URL が作られる", async ({ expect }) => {
    // 準備
    const cache = createFakeCache();
    const storage = new CloudflareCache({ cache });

    // 実行
    await storage.write(
      createSetContext("k1", { signal: AbortSignal.timeout(5_000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 検証
    expect(cache.calls[0]).toStrictEqual({
      operation: "put",
      url: "https://unikvs.cloudflare-cache/k1",
    });
  });

  test("独自の origin を指定したとき、その起点で URL が作られる", async ({ expect }) => {
    // 準備
    const cache = createFakeCache();
    const storage = new CloudflareCache({ cache, origin: "https://example.com/cache/" });

    // 実行
    await storage.write(
      createSetContext("k1", { signal: AbortSignal.timeout(5_000) }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 検証
    expect(cache.calls[0]).toStrictEqual({ operation: "put", url: "https://example.com/cache/k1" });
  });

  test("特殊文字を含むキーは 1 つのパスセグメントとして符号化される", async ({ expect }) => {
    // 準備
    const cache = createFakeCache();
    const storage = new CloudflareCache({ cache });

    // 実行
    await storage.write(
      createSetContext("a/b c+d.e", {
        signal: AbortSignal.timeout(5_000),
      }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    const result = await storage.read(
      createGetContext("a/b c+d.e", {
        signal: AbortSignal.timeout(5_000),
      }) as IStorage.ReadContext,
    );

    // 検証
    expect(result).toStrictEqual(new Uint8Array([1]));
    expect(cache.calls[0]?.url).toBe("https://unikvs.cloudflare-cache/a%2Fb%20c%2Bd%2Ee");
  });

  test("符号化できないキーは InvalidKeyError を投げる", async ({ expect }) => {
    // 準備
    const storage = new CloudflareCache({ cache: createFakeCache() });

    // 実行
    const error = await captureRejection(
      storage.read(
        createGetContext("\uD800", {
          signal: AbortSignal.timeout(5_000),
        }) as IStorage.ReadContext,
      ),
    );

    // 検証
    expect(error).toBeInstanceOf(InvalidKeyError);
    expect((error as InvalidKeyError).meta).toStrictEqual({ key: "\uD800" });
  });

  test("不正な origin は InvalidOriginError を投げる", ({ expect }) => {
    // 準備
    const cases: [string, unknown][] = [
      ["非文字列", 42],
      ["前後空白", " https://example.com "],
      ["空文字", ""],
      ["スラッシュのみ", "///"],
      ["相対 URL", "/cache"],
      ["query 付き", "https://example.com/?x=1"],
      ["fragment 付き", "https://example.com/#x"],
    ];

    // 実行と検証
    for (const [label, actual] of cases) {
      let error: unknown;

      try {
        new CloudflareCache({ cache: createFakeCache(), origin: actual as string });
      } catch (ex) {
        error = ex;
      }

      expect(error, label).toBeInstanceOf(InvalidOriginError);
    }
  });
});

describe("失敗と制約", () => {
  test("clear は ClearNotSupportedError を投げる", ({ expect }) => {
    // 準備
    const storage = new CloudflareCache({ cache: createFakeCache() });

    // 実行
    let error: unknown;

    try {
      storage.clear(
        createClearContext("", { signal: AbortSignal.timeout(5_000) }) as IStorage.ClearContext,
      );
    } catch (ex) {
      error = ex;
    }

    // 検証
    expect(error).toBeInstanceOf(ClearNotSupportedError);
  });

  test("put の失敗は CacheOperationError になる", async ({ expect }) => {
    // 準備
    const storage = new CloudflareCache({ cache: createFakeCache({ failOn: "put" }) });

    // 実行
    const error = await captureRejection(
      storage.write(
        createSetContext("k1", { signal: AbortSignal.timeout(5_000) }) as IStorage.WriteContext,
        new Uint8Array([1]),
      ),
    );

    // 検証
    expect(error).toBeInstanceOf(CacheOperationError);
    expect((error as CacheOperationError).meta).toStrictEqual({ operation: "put", key: "k1" });
  });

  test("match の失敗（read）は CacheOperationError になる", async ({ expect }) => {
    // 準備
    const storage = new CloudflareCache({ cache: createFakeCache({ failOn: "match" }) });

    // 実行
    const error = await captureRejection(
      storage.read(
        createGetContext("k1", { signal: AbortSignal.timeout(5_000) }) as IStorage.ReadContext,
      ),
    );

    // 検証
    expect(error).toBeInstanceOf(CacheOperationError);
    expect((error as CacheOperationError).meta).toStrictEqual({ operation: "match", key: "k1" });
  });

  test("match の失敗（exists）は CacheOperationError になる", async ({ expect }) => {
    // 準備
    const storage = new CloudflareCache({ cache: createFakeCache({ failOn: "match" }) });

    // 実行
    const error = await captureRejection(
      storage.exists(
        createHasContext("k1", { signal: AbortSignal.timeout(5_000) }) as IStorage.ExistsContext,
      ),
    );

    // 検証
    expect(error).toBeInstanceOf(CacheOperationError);
    expect((error as CacheOperationError).meta).toStrictEqual({ operation: "match", key: "k1" });
  });

  test("delete の失敗は CacheOperationError になる", async ({ expect }) => {
    // 準備
    const storage = new CloudflareCache({ cache: createFakeCache({ failOn: "delete" }) });

    // 実行
    const error = await captureRejection(
      storage.delete(
        createDeleteContext("k1", { signal: AbortSignal.timeout(5_000) }) as IStorage.DeleteContext,
      ),
    );

    // 検証
    expect(error).toBeInstanceOf(CacheOperationError);
    expect((error as CacheOperationError).meta).toStrictEqual({ operation: "delete", key: "k1" });
  });

  test("getReadable の match 失敗は CacheOperationError になる", async ({ expect }) => {
    // 準備
    const storage = new CloudflareCache({ cache: createFakeCache({ failOn: "match" }) });

    // 実行
    const error = await captureRejection(
      storage.getReadable?.(
        createStreamContext("k1", {
          signal: AbortSignal.timeout(5_000),
        }) as IStorage.GetReadableContext,
      ),
    );

    // 検証
    expect(error).toBeInstanceOf(CacheOperationError);
  });

  test("getWritable の close 時の put 失敗は CacheOperationError になる", async ({ expect }) => {
    // 準備
    const storage = new CloudflareCache({ cache: createFakeCache({ failOn: "put" }) });
    const writer = storage
      .getWritable?.(
        createSetContext("k1", {
          signal: AbortSignal.timeout(5_000),
        }) as IStorage.GetWritableContext,
      )
      ?.getWriter();

    // 実行
    await writer?.write(new Uint8Array([1]));
    const error = await captureRejection(writer?.close() ?? Promise.resolve());

    // 検証
    expect(error).toBeInstanceOf(CacheOperationError);
  });
});
