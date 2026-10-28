import type { IStorage } from "@unikvs/core";
import {
  bytesEqual,
  createGetContext,
  createSetContext,
  createOpenContext,
  createCloseContext,
  createDeleteContext,
  createPseudoRandomBytes,
} from "@unikvs/testing";
import { RedisClient } from "bun";
import { vi, describe } from "vite-plus/test";

import { test, createStorage } from "./_helpers.js";

describe("並行操作", () => {
  test("並行した open は接続を 1 つだけ作り、close でその接続を閉じる", async ({
    url,
    expect,
    keyPrefix,
  }) => {
    // 準備：
    const storage = createStorage(url, keyPrefix);
    const gate = Promise.withResolvers<void>();
    const connectSpy = vi
      .spyOn(RedisClient.prototype, "connect")
      .mockImplementation(() => gate.promise);
    const closeSpy = vi.spyOn(RedisClient.prototype, "close").mockImplementation(() => {});

    try {
      // 実行：
      const first = storage.open(createOpenContext() as IStorage.OpenContext);
      const second = storage.open(createOpenContext() as IStorage.OpenContext);

      await vi.waitFor(() => {
        expect(connectSpy).toHaveBeenCalledTimes(1);
      });

      // 検証：
      expect(storage.isOpen).toBe(false);

      gate.resolve();
      await Promise.all([first, second]);

      expect(storage.isOpen).toBe(true);

      storage.close(createCloseContext() as IStorage.CloseContext);

      expect(closeSpy).toHaveBeenCalledTimes(1);
      expect(storage.isOpen).toBe(false);
    } finally {
      gate.resolve();
      vi.restoreAllMocks();
    }
  });

  test("open の接続待ち中に close すると、接続は公開されない", async ({
    url,
    expect,
    keyPrefix,
  }) => {
    // 準備：
    const storage = createStorage(url, keyPrefix);
    const gate = Promise.withResolvers<void>();
    const connectSpy = vi
      .spyOn(RedisClient.prototype, "connect")
      .mockImplementation(() => gate.promise);
    const closeSpy = vi.spyOn(RedisClient.prototype, "close").mockImplementation(() => {});

    try {
      const opening = storage.open(createOpenContext() as IStorage.OpenContext);

      await vi.waitFor(() => {
        expect(connectSpy).toHaveBeenCalledTimes(1);
      });

      // 実行：
      storage.close(createCloseContext() as IStorage.CloseContext);
      gate.resolve();

      // 検証：
      await expect(opening).rejects.toThrow(TypeError);
      expect(storage.isOpen).toBe(false);
      expect(closeSpy).toHaveBeenCalledTimes(1);
    } finally {
      gate.resolve();
      vi.restoreAllMocks();
    }
  });

  test("接続の公開直後に close が割り込んでも、公開された接続を閉じる", async ({
    url,
    expect,
    keyPrefix,
  }) => {
    // 準備：
    const storage = createStorage(url, keyPrefix);
    const gate = Promise.withResolvers<void>();
    const connectSpy = vi
      .spyOn(RedisClient.prototype, "connect")
      .mockImplementation(() => gate.promise);
    const closeSpy = vi.spyOn(RedisClient.prototype, "close").mockImplementation(() => {});

    try {
      const opening = storage.open(createOpenContext() as IStorage.OpenContext);

      await vi.waitFor(() => {
        expect(connectSpy).toHaveBeenCalledTimes(1);
      });

      // 実行：
      // connect の完了を open() の継続より先に処理させ、公開直後の close を再現します。
      gate.resolve();
      queueMicrotask(() => {
        storage.close(createCloseContext() as IStorage.CloseContext);
      });

      // 検証：
      await expect(opening).resolves.toBeUndefined();
      expect(closeSpy).toHaveBeenCalledTimes(1);
      expect(storage.isOpen).toBe(false);
    } finally {
      gate.resolve();
      vi.restoreAllMocks();
    }
  });

  test("接続待ちの open を close でキャンセルした後、open し直せる", async ({
    url,
    expect,
    signal,
    keyPrefix,
  }) => {
    // 準備：
    const storage = createStorage(url, keyPrefix);
    const gate = Promise.withResolvers<void>();
    const connectSpy = vi
      .spyOn(RedisClient.prototype, "connect")
      .mockImplementationOnce(() => gate.promise);
    const key = "reopen-after-cancel.bin";
    const data = new Uint8Array([1, 2, 3]);

    const cancelled = storage.open(createOpenContext() as IStorage.OpenContext);

    try {
      await vi.waitFor(() => {
        expect(connectSpy).toHaveBeenCalledTimes(1);
      });

      // 実行：
      storage.close(createCloseContext() as IStorage.CloseContext);
      await storage.open(createOpenContext() as IStorage.OpenContext);

      try {
        // 検証：
        expect(storage.isOpen).toBe(true);

        gate.resolve();
        await expect(cancelled).rejects.toThrow(TypeError);
        expect(storage.isOpen).toBe(true);

        await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);
        await expect(
          storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
        ).resolves.toStrictEqual(data);
      } finally {
        storage.close(createCloseContext() as IStorage.CloseContext);
      }
    } finally {
      gate.resolve();
      vi.restoreAllMocks();

      try {
        await cancelled;
      } catch {
        // キャンセル済みの open は検証済みか、テスト失敗時の後始末として無視します。
      }
    }
  });

  test("異なるキーへ並列に書き込んだとき、すべてのデータが保存される", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備：
    const entries = Array.from({ length: 100 }, (_, index) => ({
      key: `parallel/${index}.bin`,
      data: createPseudoRandomBytes(512, index),
    }));

    // 実行：
    await Promise.all(
      entries.map(({ key, data }) =>
        storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data),
      ),
    );

    // 検証：
    for (const { key, data } of entries) {
      const result = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);
      expect(bytesEqual(result, data)).toBe(true);
    }
  });

  test("同じキーへ並列に書き込んだとき、書き込んだうちのどれか 1 つが残る", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備：
    const key = "parallel-same-key.bin";
    const payloads = Array.from({ length: 20 }, (_, index) =>
      createPseudoRandomBytes(1024, index + 100),
    );

    // 実行：
    await Promise.all(
      payloads.map((data) =>
        storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data),
      ),
    );

    // 検証：
    const result = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);
    expect(payloads.some((payload) => bytesEqual(result, payload))).toBe(true);
  });

  test("並列に書き込みと削除をしても、存在しないキーの削除でエラーにならない", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備：
    const key = "parallel-write-delete.bin";
    const data = new Uint8Array([1, 2, 3]);

    // 実行：
    await Promise.all([
      storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data),
      storage.delete(createDeleteContext(key, { signal }) as IStorage.DeleteContext),
      storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data),
      storage.delete(createDeleteContext(key, { signal }) as IStorage.DeleteContext),
    ]);

    // 検証：
    await expect(
      storage.delete(createDeleteContext(key, { signal }) as IStorage.DeleteContext),
    ).resolves.toBeUndefined();
  });

  test("同じキーを並列に読み取ったとき、すべて同じデータが返る", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備：
    const key = "parallel-read.bin";
    const data = createPseudoRandomBytes(64 * 1024, 999);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

    // 実行：
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
      ),
    );

    // 検証：
    for (const result of results) {
      expect(bytesEqual(result, data)).toBe(true);
    }
  });
});
