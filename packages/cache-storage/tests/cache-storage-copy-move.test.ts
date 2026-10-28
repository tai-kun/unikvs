import type { IStorage } from "@unikvs/core";
import { createGetContext, createHasContext, createOpenContext } from "@unikvs/testing";
import { describe } from "vite-plus/test";

import CacheStorage from "../src/cache-storage.js";
import { KeyNotFoundError } from "../src/errors.js";
import {
  type NativeCacheStorage,
  test,
  readBytes,
  writeBytes,
  createRequest,
  createFakeCaches,
  createCopyContext,
  createMoveContext,
} from "./_helpers.js";

const { signal } = new AbortController();
describe("コピー (copy) の振る舞い", () => {
  test("複製元を残したまま複製先へボディを書き込む", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await writeBytes(storage, "source", new Uint8Array([1, 2, 3]));

    // 実行：
    await storage.copy(
      createCopyContext("source", "destination", { signal }) as IStorage.CopyContext,
    );

    // 検証：
    expect(await readBytes(storage, "source")).toStrictEqual(new Uint8Array([1, 2, 3]));
    expect(await readBytes(storage, "destination")).toStrictEqual(new Uint8Array([1, 2, 3]));
  });

  test("複製先に既存の Response があるとき、上書きする", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await writeBytes(storage, "source", new Uint8Array([1]));
    await writeBytes(storage, "destination", new Uint8Array([9]));

    // 実行：
    await storage.copy(
      createCopyContext("source", "destination", { signal }) as IStorage.CopyContext,
    );

    // 検証：
    expect(await readBytes(storage, "destination")).toStrictEqual(new Uint8Array([1]));
  });

  test("複製元と複製先が同じキーのとき、値を残したまま成功する", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await writeBytes(storage, "same", new Uint8Array([4, 5]));

    // 実行と検証：
    await expect(
      storage.copy(createCopyContext("same", "same", { signal }) as IStorage.CopyContext),
    ).resolves.toBeUndefined();
    expect(await readBytes(storage, "same")).toStrictEqual(new Uint8Array([4, 5]));
  });

  test("複製元が存在しないとき、KeyNotFoundError で拒否される", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行と検証：
    await expect(
      storage.copy(createCopyContext("missing", "destination", { signal }) as IStorage.CopyContext),
    ).rejects.toThrow(KeyNotFoundError);
  });
});
describe("移動 (move) の振る舞い", () => {
  test("移動先へボディを書き込み、移動元を削除する", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await writeBytes(storage, "source", new Uint8Array([1, 2, 3]));

    // 実行：
    await storage.move(
      createMoveContext("source", "destination", { signal }) as IStorage.MoveContext,
    );

    // 検証：
    expect(
      await storage.exists(createHasContext("source", { signal }) as IStorage.ExistsContext),
    ).toBe(false);
    expect(await readBytes(storage, "destination")).toStrictEqual(new Uint8Array([1, 2, 3]));
  });

  test("移動先に既存の Response があるとき、上書きする", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await writeBytes(storage, "source", new Uint8Array([1]));
    await writeBytes(storage, "destination", new Uint8Array([9]));

    // 実行：
    await storage.move(
      createMoveContext("source", "destination", { signal }) as IStorage.MoveContext,
    );

    // 検証：
    expect(
      await storage.exists(createHasContext("source", { signal }) as IStorage.ExistsContext),
    ).toBe(false);
    expect(await readBytes(storage, "destination")).toStrictEqual(new Uint8Array([1]));
  });

  test("移動元と移動先が同じキーのとき、値を残したまま成功する", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await writeBytes(storage, "same", new Uint8Array([4, 5]));

    // 実行と検証：
    await expect(
      storage.move(createMoveContext("same", "same", { signal }) as IStorage.MoveContext),
    ).resolves.toBeUndefined();
    expect(await readBytes(storage, "same")).toStrictEqual(new Uint8Array([4, 5]));
  });

  test("移動元が存在しないとき、KeyNotFoundError で拒否される", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行と検証：
    await expect(
      storage.move(createMoveContext("missing", "destination", { signal }) as IStorage.MoveContext),
    ).rejects.toThrow(KeyNotFoundError);
  });

  test("移動先の Response をそのまま読み出せる", async ({ expect, storage }) => {
    // 準備：
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await writeBytes(storage, "source", new Uint8Array([7, 8, 9]));

    // 実行：
    await storage.move(
      createMoveContext("source", "destination", { signal }) as IStorage.MoveContext,
    );

    // 検証：
    const response = await storage.read(
      createGetContext("destination", { signal }) as IStorage.ReadContext,
    );
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toStrictEqual(new Uint8Array([7, 8, 9]));
  });

  test("移動先の書き込みに失敗したとき、移動元を残す", async ({ expect, cacheName }) => {
    // 準備：
    const backend = createFakeCaches();
    const storage = new CacheStorage({
      caches: backend,
      cacheName,
      toRequest: createRequest,
    });
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await writeBytes(storage, "source", new Uint8Array([1, 2, 3]));

    const failingBackend = Object.create(backend) as NativeCacheStorage;
    failingBackend.open = async (name: string): Promise<Cache> => {
      const cache = await backend.open(name);
      const failingCache = Object.create(cache) as Cache;
      failingCache.put = async (): Promise<void> => {
        throw new Error("write failed");
      };

      return failingCache;
    };

    const failingStorage = new CacheStorage({
      caches: failingBackend,
      cacheName,
      toRequest: createRequest,
    });
    await failingStorage.open(createOpenContext({ signal }) as IStorage.OpenContext);

    // 実行：
    const error = await failingStorage
      .move(createMoveContext("source", "destination", { signal }) as IStorage.MoveContext)
      .catch((ex: unknown) => ex);

    // 検証：
    expect(error).toBeInstanceOf(Error);

    expect(await readBytes(failingStorage, "source")).toStrictEqual(new Uint8Array([1, 2, 3]));
    expect(
      await failingStorage.exists(
        createHasContext("destination", { signal }) as IStorage.ExistsContext,
      ),
    ).toBe(false);
  });
});
