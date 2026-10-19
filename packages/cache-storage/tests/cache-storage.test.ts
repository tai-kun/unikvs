import type { IStorage } from "@unikvs/core";
import {
  abortedSignal,
  createClearContext,
  createCloseContext,
  createDeleteContext,
  createGetContext,
  createHasContext,
  createOpenContext,
  createSetContext,
  createStreamContext,
} from "@unikvs/testing";
import { describe } from "vitest";

import CacheStorage from "../src/cache-storage.js";
import { KeyNotFoundError } from "../src/errors.js";
import { createFakeCaches, runWithGlobalCaches, test } from "./_helpers.js";

const { signal } = new AbortController();

describe("ライフサイクル管理", () => {
  test("インスタンス化したとき、初期状態はクローズ状態である", ({ expect, storage }) => {
    // 準備はフィクスチャーで行われている。

    // 実行と検証
    expect(storage.name).toBe("CacheStorage");
    expect(storage.isOpen).toBe(false);
  });

  test("open を実行したとき、オープン状態になる", async ({ expect, storage }) => {
    // 実行
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 検証
    expect(storage.isOpen).toBe(true);
  });

  test("すでにオープンされた状態で再度 open を実行したとき、エラーが発生せず状態が維持される", async ({
    expect,
    storage,
  }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行と検証
    await expect(
      storage.open(createOpenContext({ signal }) as IStorage.OpenContext),
    ).resolves.not.toThrow();
    expect(storage.isOpen).toBe(true);
  });

  test("close を実行したとき、クローズ状態になる", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行
    await storage.close(createCloseContext({ signal }) as IStorage.CloseContext);

    // 検証
    expect(storage.isOpen).toBe(false);
  });

  test("close した後に再度 open したとき、保存値は引き継がれる", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.write(
      createSetContext("k1", { signal }) as IStorage.WriteContext,
      new Uint8Array([1, 2]),
    );
    await storage.close(createCloseContext({ signal }) as IStorage.CloseContext);

    // 実行
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const result = await storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext);

    // 検証
    expect(storage.isOpen).toBe(true);
    expect(result).toStrictEqual(new Uint8Array([1, 2]));
  });
});

describe("基本データ操作 (CRUD)", () => {
  test("データを書き込んだとき、正しく保存される", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const key = "k1";
    const data = new Uint8Array([1, 2, 3]);

    // 実行
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

    // 検証
    const exists = await storage.exists(
      createHasContext(key, { signal }) as IStorage.ExistsContext,
    );
    expect(exists).toBe(true);
    expect(
      await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).toStrictEqual(data);
  });

  test("存在しないキーを読み込もうとしたとき、KeyNotFoundError が発生する", async ({
    expect,
    storage,
  }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行と検証
    await expect(
      storage.read(createGetContext("missing", { signal }) as IStorage.ReadContext),
    ).rejects.toThrow(KeyNotFoundError);
  });

  test("存在しないキーを削除しようとしたとき、KeyNotFoundError が発生する", async ({
    expect,
    storage,
  }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行と検証
    await expect(
      storage.delete(createDeleteContext("missing", { signal }) as IStorage.DeleteContext),
    ).rejects.toThrow(KeyNotFoundError);
  });

  test("存在しないキーに対して exists を実行したとき、false が返る", async ({
    expect,
    storage,
  }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行と検証
    expect(
      await storage.exists(createHasContext("missing", { signal }) as IStorage.ExistsContext),
    ).toBe(false);
  });

  test("既存のキーに上書きしたとき、値が置き換わる", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.write(
      createSetContext("k1", { signal }) as IStorage.WriteContext,
      new Uint8Array([9]),
    );

    // 実行
    await storage.write(
      createSetContext("k1", { signal }) as IStorage.WriteContext,
      new Uint8Array([1, 2]),
    );

    // 検証
    expect(
      await storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext),
    ).toStrictEqual(new Uint8Array([1, 2]));
  });

  test("データを削除したとき、そのデータが存在しなくなる", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.write(
      createSetContext("k1", { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 実行
    await storage.delete(createDeleteContext("k1", { signal }) as IStorage.DeleteContext);

    // 検証
    expect(await storage.exists(createHasContext("k1", { signal }) as IStorage.ExistsContext)).toBe(
      false,
    );
  });

  test("clear を実行したとき、すべてのデータが削除される", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.write(
      createSetContext("k1", { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await storage.write(
      createSetContext("k2", { signal }) as IStorage.WriteContext,
      new Uint8Array([2]),
    );

    // 実行
    await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

    // 検証
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
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const key = "!@#$%^&*()_+-=[]{}|;':,./<>?`~ あいうえお";
    const data = new Uint8Array([7, 8, 9]);

    // 実行
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);
    const result = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);

    // 検証
    expect(result).toStrictEqual(data);
  });

  test("空文字列のキーを使用した場合、正しくデータを操作できる", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const data = new Uint8Array([1]);

    // 実行
    await storage.write(createSetContext("", { signal }) as IStorage.WriteContext, data);
    const result = await storage.read(createGetContext("", { signal }) as IStorage.ReadContext);

    // 検証
    expect(result).toStrictEqual(data);
  });

  test("大容量のデータを書き込んだとき、正常に保存される", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const size = 2 * 1024 * 1024;
    const data = new Uint8Array(size).fill(1);

    // 実行
    await storage.write(createSetContext("large", { signal }) as IStorage.WriteContext, data);
    const result = await storage.read(
      createGetContext("large", { signal }) as IStorage.ReadContext,
    );

    // 検証
    expect(result.length).toBe(size);
    expect(result[0]).toBe(1);
    expect(result[size - 1]).toBe(1);
  });

  test("キーは Request URL に符号化して保存される", async ({ cacheName, expect }) => {
    // 準備
    const backend = createFakeCaches();
    const storage = new CacheStorage(cacheName, { caches: backend });
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const key = "a/b c?d#e";

    // 実行
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 検証
    expect(await backend.keys()).toStrictEqual([cacheName]);
    const cache = await backend.open(cacheName);
    expect(
      await cache.keys().then((requests) => requests.map((request) => request.url)),
    ).toStrictEqual([`https://unikvs.local/${encodeURIComponent(key)}`]);
  });

  test("Uint8Array 以外の値を書いたとき、素通しで保存される", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行
    await storage.write(
      createSetContext("text", { signal }) as IStorage.WriteContext,
      "hello" as unknown as Uint8Array<ArrayBuffer>,
    );

    // 検証
    expect(
      await storage.read(createGetContext("text", { signal }) as IStorage.ReadContext),
    ).toStrictEqual(new TextEncoder().encode("hello"));
  });
});

describe("データの隔離", () => {
  test("書き込んだバッファを変更したとき、保存値は変わらない", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const source = new Uint8Array([1, 2, 3]);
    await storage.write(createSetContext("k1", { signal }) as IStorage.WriteContext, source);

    // 実行
    source[0] = 99;

    // 検証
    expect(
      await storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext),
    ).toStrictEqual(new Uint8Array([1, 2, 3]));
  });

  test("読み取った値を変更したとき、保存値は変わらない", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.write(
      createSetContext("k1", { signal }) as IStorage.WriteContext,
      new Uint8Array([1, 2, 3]),
    );

    // 実行
    const first = await storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext);
    first[0] = 99;

    // 検証
    expect(
      await storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext),
    ).toStrictEqual(new Uint8Array([1, 2, 3]));
  });

  test("同じバックエンドの別インスタンスからは値が見える", async ({ cacheName, expect }) => {
    // 準備
    const backend = createFakeCaches();
    const first = new CacheStorage(cacheName, { caches: backend });
    await first.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await first.write(
      createSetContext("k1", { signal }) as IStorage.WriteContext,
      new Uint8Array([5]),
    );
    const second = new CacheStorage(cacheName, { caches: backend });
    await second.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行
    const result = await second.read(createGetContext("k1", { signal }) as IStorage.ReadContext);

    // 検証
    expect(result).toStrictEqual(new Uint8Array([5]));
  });

  test("Cache 名が異なるとき、値は共有されない", async ({ expect }) => {
    // 準備
    const backend = createFakeCaches();
    const first = new CacheStorage("cache-a", { caches: backend });
    await first.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await first.write(
      createSetContext("k1", { signal }) as IStorage.WriteContext,
      new Uint8Array([5]),
    );
    const second = new CacheStorage("cache-b", { caches: backend });
    await second.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行と検証
    expect(await second.exists(createHasContext("k1", { signal }) as IStorage.ExistsContext)).toBe(
      false,
    );
  });

  test("注入なしでも globalThis.caches があれば CRUD できる", async ({ cacheName, expect }) => {
    await runWithGlobalCaches(createFakeCaches(), async () => {
      // 準備
      const storage = new CacheStorage(cacheName);
      await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

      // 実行
      await storage.write(
        createSetContext("k1", { signal }) as IStorage.WriteContext,
        new Uint8Array([1]),
      );

      // 検証
      expect(
        await storage.read(createGetContext("k1", { signal }) as IStorage.ReadContext),
      ).toStrictEqual(new Uint8Array([1]));
    });
  });
});

describe("中断処理", () => {
  test("中断済みの signal はすべての非同期メソッドを中断理由で拒否する", async ({
    expect,
    storage,
  }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.write(
      createSetContext("k1", { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    const reason = new Error("独自の中断理由");
    const aborted = abortedSignal(reason);

    // 実行と検証
    await expect(
      storage.open(createOpenContext({ signal: aborted }) as IStorage.OpenContext),
    ).rejects.toBe(reason);
    await expect(
      storage.write(
        createSetContext("k1", { signal: aborted }) as IStorage.WriteContext,
        new Uint8Array([2]),
      ),
    ).rejects.toBe(reason);
    await expect(
      storage.read(createGetContext("k1", { signal: aborted }) as IStorage.ReadContext),
    ).rejects.toBe(reason);
    await expect(
      storage.exists(createHasContext("k1", { signal: aborted }) as IStorage.ExistsContext),
    ).rejects.toBe(reason);
    await expect(
      storage.delete(createDeleteContext("k1", { signal: aborted }) as IStorage.DeleteContext),
    ).rejects.toBe(reason);
    await expect(
      storage.clear(createClearContext("", { signal: aborted }) as IStorage.ClearContext),
    ).rejects.toBe(reason);
    await expect(
      storage.close(createCloseContext({ signal: aborted }) as IStorage.CloseContext),
    ).rejects.toBe(reason);
  });

  test("中断済みの signal でストリーム取得を試みたとき、中断理由で throw する", async ({
    expect,
    storage,
  }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const reason = new Error("独自の中断理由");
    const aborted = abortedSignal(reason);

    // 実行と検証
    expect(() =>
      storage.getWritable(
        createSetContext("k1", { signal: aborted }) as IStorage.GetWritableContext,
      ),
    ).toThrow(reason);
    expect(() =>
      storage.getReadable(
        createStreamContext("k1", { signal: aborted }) as IStorage.GetReadableContext,
      ),
    ).toThrow(reason);
  });
});
