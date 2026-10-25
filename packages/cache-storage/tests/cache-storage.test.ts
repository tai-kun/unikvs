import type { IStorage } from "@unikvs/core";
import {
  abortedSignal,
  createGetContext,
  createHasContext,
  createSetContext,
  createOpenContext,
  createClearContext,
  createDeleteContext,
} from "@unikvs/testing";
import { describe } from "vite-plus/test";

import CacheStorage from "../src/cache-storage.js";
import { KeyNotFoundError } from "../src/errors.js";
import {
  test,
  readBody,
  readBytes,
  writeBytes,
  createRequest,
  createFakeCaches,
  runWithGlobalCaches,
} from "./_helpers.js";

const { signal } = new AbortController();
describe("ライフサイクル管理", () => {
  test("インスタンス化したとき、初期状態はクローズ状態である", ({ expect, storage }) => {
    // 準備はフィクスチャーで行われている。

    // 実行と検証：
    expect(storage.name).toBe("CacheStorage");
    expect(storage.isOpen).toBe(false);
  });

  test("open を実行したとき、オープン状態になる", async ({ expect, storage }) => {
    // 実行：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 検証：
    expect(storage.isOpen).toBe(true);
  });

  test("すでにオープンされた状態で再度 open を実行したとき、エラーが発生せず状態が維持される", async ({
    expect,
    storage,
  }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行と検証：
    await expect(
      storage.open(createOpenContext({ signal }) as IStorage.OpenContext),
    ).resolves.toBeUndefined();
    expect(storage.isOpen).toBe(true);
  });

  test("close を実行したとき、クローズ状態になる", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行：
    storage.close();

    // 検証：
    expect(storage.isOpen).toBe(false);
  });

  test("close した後に再度 open したとき、保存値は引き継がれる", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await writeBytes(storage, "k1", new Uint8Array([1, 2]));
    storage.close();

    // 実行：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const result = await readBytes(storage, "k1");

    // 検証：
    expect(storage.isOpen).toBe(true);
    expect(result).toStrictEqual(new Uint8Array([1, 2]));
  });
});
describe("基本データ操作 (CRUD)", () => {
  test("データを書き込んだとき、正しく保存される", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const key = "k1";
    const data = new Uint8Array([1, 2, 3]);

    // 実行：
    await writeBytes(storage, key, data);

    // 検証：
    expect(await storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext)).toBe(
      true,
    );
    expect(await readBytes(storage, key)).toStrictEqual(data);
  });

  test("存在しないキーを読み込もうとしたとき、KeyNotFoundError が発生する", async ({
    expect,
    storage,
  }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行と検証：
    await expect(
      storage.read(createGetContext("missing", { signal }) as IStorage.ReadContext),
    ).rejects.toThrow(KeyNotFoundError);
  });

  test("存在しないキーを削除しようとしたとき、KeyNotFoundError が発生する", async ({
    expect,
    storage,
  }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行と検証：
    await expect(
      storage.delete(createDeleteContext("missing", { signal }) as IStorage.DeleteContext),
    ).rejects.toThrow(KeyNotFoundError);
  });

  test("存在しないキーに対して exists を実行したとき、false が返る", async ({
    expect,
    storage,
  }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行と検証：
    expect(
      await storage.exists(createHasContext("missing", { signal }) as IStorage.ExistsContext),
    ).toBe(false);
  });

  test("既存のキーに上書きしたとき、値が置き換わる", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await writeBytes(storage, "k1", new Uint8Array([9]));

    // 実行：
    await writeBytes(storage, "k1", new Uint8Array([1, 2]));

    // 検証：
    expect(await readBytes(storage, "k1")).toStrictEqual(new Uint8Array([1, 2]));
  });

  test("データを削除したとき、そのデータが存在しなくなる", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await writeBytes(storage, "k1", new Uint8Array([1]));

    // 実行：
    await storage.delete(createDeleteContext("k1", { signal }) as IStorage.DeleteContext);

    // 検証：
    expect(await storage.exists(createHasContext("k1", { signal }) as IStorage.ExistsContext)).toBe(
      false,
    );
  });

  test("clear を実行したとき、すべてのデータが削除される", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await writeBytes(storage, "k1", new Uint8Array([1]));
    await writeBytes(storage, "k2", new Uint8Array([2]));

    // 実行：
    await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

    // 検証：
    expect(await storage.exists(createHasContext("k1", { signal }) as IStorage.ExistsContext)).toBe(
      false,
    );
    expect(await storage.exists(createHasContext("k2", { signal }) as IStorage.ExistsContext)).toBe(
      false,
    );
  });

  test("特殊文字を含むキーを使用した場合、正しくデータを操作できる", async ({
    expect,
    storage,
  }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const key = "!@#$%^&*()_+-=[]{}|;':,./<>?`~ あいうえお";
    const data = new Uint8Array([7, 8, 9]);

    // 実行：
    await writeBytes(storage, key, data);

    const result = await readBytes(storage, key);

    // 検証：
    expect(result).toStrictEqual(data);
  });

  test("空文字列のキーを使用した場合、正しくデータを操作できる", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const data = new Uint8Array([1]);

    // 実行：
    await writeBytes(storage, "", data);

    const result = await readBytes(storage, "");

    // 検証：
    expect(result).toStrictEqual(data);
  });

  test("大容量のデータを書き込んだとき、正常に保存される", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const size = 2 * 1024 * 1024;
    const data = new Uint8Array(size).fill(1);

    // 実行：
    await writeBytes(storage, "large", data);

    const result = await readBytes(storage, "large");

    // 検証：
    expect(result.length).toBe(size);
    expect(result[0]).toBe(1);
    expect(result[size - 1]).toBe(1);
  });

  test("toRequest が変換した Request が保存キーに使われる", async ({ expect, cacheName }) => {
    // 準備：
    const backend = createFakeCaches();
    const storage = new CacheStorage({
      caches: backend,
      cacheName,
      toRequest: (key: string): Request =>
        new Request(`https://example.test/items/${encodeURIComponent(key)}`),
    });
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    const key = "a/b c?d#e";

    // 実行：
    await writeBytes(storage, key, new Uint8Array([1]));

    // 検証：
    expect(await readBytes(storage, key)).toStrictEqual(new Uint8Array([1]));

    const cache = await backend.open(cacheName);
    const requests = await cache.keys();
    expect(requests.map((request) => request.url)).toStrictEqual([
      `https://example.test/items/${encodeURIComponent(key)}`,
    ]);
  });

  test("書き込んだ Response のステータスとヘッダーも読み取れる", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const response = new Response(new Uint8Array([1, 2]), {
      status: 201,
      headers: {
        "X-Test": "yes",
        "Content-Type": "application/x-test",
      },
      statusText: "Created",
    });

    // 実行：
    await storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, response);

    const result = await storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext);

    // 検証：
    expect(result.status).toBe(201);
    expect(result.statusText).toBe("Created");
    expect(result.headers.get("Content-Type")).toBe("application/x-test");
    expect(result.headers.get("X-Test")).toBe("yes");
    expect(await readBody(result)).toStrictEqual(new Uint8Array([1, 2]));
  });
});
describe("データの隔離", () => {
  test("同じバックエンドの別インスタンスからは値が見える", async ({ expect, cacheName }) => {
    // 準備：
    const backend = createFakeCaches();
    const first = new CacheStorage({
      caches: backend,
      cacheName,
      toRequest: createRequest,
    });
    await first.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await writeBytes(first, "k1", new Uint8Array([5]));

    const second = new CacheStorage({
      caches: backend,
      cacheName,
      toRequest: createRequest,
    });
    await second.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行：
    const result = await readBytes(second, "k1");

    // 検証：
    expect(result).toStrictEqual(new Uint8Array([5]));
  });

  test("Cache 名が異なるとき、値は共有されない", async ({ expect }) => {
    // 準備：
    const backend = createFakeCaches();
    const first = new CacheStorage({
      caches: backend,
      cacheName: "cache-a",
      toRequest: createRequest,
    });
    await first.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await writeBytes(first, "k1", new Uint8Array([5]));

    const second = new CacheStorage({
      caches: backend,
      cacheName: "cache-b",
      toRequest: createRequest,
    });
    await second.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行と検証：
    expect(await second.exists(createHasContext("k1", { signal }) as IStorage.ExistsContext)).toBe(
      false,
    );
  });

  test("注入なしでも globalThis.caches があれば CRUD できる", async ({ expect, cacheName }) => {
    await runWithGlobalCaches(createFakeCaches(), async () => {
      // 準備：
      const storage = new CacheStorage({
        cacheName,
        toRequest: createRequest,
      });
      await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

      // 実行：
      await writeBytes(storage, "k1", new Uint8Array([1]));

      // 検証：
      expect(await readBytes(storage, "k1")).toStrictEqual(new Uint8Array([1]));
    });
  });
});

// write / delete / close は副作用を伴い、実行中に中断してもバックエンドの処理が継続し得ます。
// UniKvs は各メソッドの実行前に中断を確認するため、これらは abortPromise で中断しません。
// ここでは、待機中の処理を安全に打ち切れるメソッドだけを検証します。
describe("中断処理", () => {
  test("open の待機中に中断したとき、中断理由で拒否される", async ({ expect, cacheName }) => {
    // 準備：
    const storage = new CacheStorage({
      caches: createFakeCaches({ pending: "open" }),
      cacheName,
      toRequest: createRequest,
    });
    const reason = new Error("独自の中断理由");
    const aborted = abortedSignal(reason);

    // 実行と検証：
    await expect(
      storage.open(createOpenContext({ signal: aborted }) as IStorage.OpenContext),
    ).rejects.toBe(reason);
    expect(storage.isOpen).toBe(false);
  });

  test("read の待機中に中断したとき、中断理由で拒否される", async ({ expect, cacheName }) => {
    // 準備：
    const storage = new CacheStorage({
      caches: createFakeCaches({ pending: "match" }),
      cacheName,
      toRequest: createRequest,
    });
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    const reason = new Error("独自の中断理由");
    const aborted = abortedSignal(reason);

    // 実行と検証：
    await expect(
      storage.read(createGetContext("k1", { signal: aborted }) as IStorage.ReadContext),
    ).rejects.toBe(reason);
  });

  test("exists の待機中に中断したとき、中断理由で拒否される", async ({ expect, cacheName }) => {
    // 準備：
    const storage = new CacheStorage({
      caches: createFakeCaches({ pending: "match" }),
      cacheName,
      toRequest: createRequest,
    });
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    const reason = new Error("独自の中断理由");
    const aborted = abortedSignal(reason);

    // 実行と検証：
    await expect(
      storage.exists(createHasContext("k1", { signal: aborted }) as IStorage.ExistsContext),
    ).rejects.toBe(reason);
  });

  test("clear の待機中に中断したとき、中断理由で拒否される", async ({ expect, cacheName }) => {
    // 準備：
    const storage = new CacheStorage({
      caches: createFakeCaches({ pending: "keys" }),
      cacheName,
      toRequest: createRequest,
    });
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    const reason = new Error("独自の中断理由");
    const aborted = abortedSignal(reason);

    // 実行と検証：
    await expect(
      storage.clear(createClearContext("", { signal: aborted }) as IStorage.ClearContext),
    ).rejects.toBe(reason);
  });
});
