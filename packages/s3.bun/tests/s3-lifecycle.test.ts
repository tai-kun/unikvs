import type { IStorage } from "@unikvs/core";
import {
  createGetContext,
  createHasContext,
  createSetContext,
  createOpenContext,
  createClearContext,
  createCloseContext,
  createDeleteContext,
  createStreamContext,
} from "@unikvs/testing";
import { describe } from "vite-plus/test";

import { StorageNotOpenError } from "../src/errors.js";
import S3 from "../src/s3.js";
import { test, createClientConfig } from "./_helpers.js";

describe("ライフサイクル管理", () => {
  test("ストレージ名は S3 である", ({ expect, storage }) => {
    // 準備と実行は constructor で完了している。

    // 検証：
    expect(storage.name).toBe("S3");
  });

  test("インスタンス化した直後は、isOpen が false である", ({ bucket, expect, endpoint }) => {
    // 準備：
    const unopened = new S3(bucket, createClientConfig(endpoint));

    // 実行と検証：
    expect(unopened.isOpen).toBe(false);
  });

  test("open を呼び出すと、isOpen が true になる", ({ expect, storage }) => {
    // 準備と実行はフィクスチャーで完了している。

    // 検証：
    expect(storage.isOpen).toBe(true);
  });

  test("close を呼び出すと、isOpen が false に戻る", ({ expect, storage }) => {
    // 実行：
    storage.close(createCloseContext() as IStorage.CloseContext);

    // 検証：
    expect(storage.isOpen).toBe(false);
  });

  test("close を 2 回呼び出すと 2 回目は StorageNotOpenError になる", ({ expect, storage }) => {
    // 準備：
    storage.close(createCloseContext() as IStorage.CloseContext);

    // 実行と検証：
    expect(() => {
      storage.close(createCloseContext() as IStorage.CloseContext);
    }).toThrow(StorageNotOpenError);
  });

  test("open を 2 回呼び出しても isOpen は true のままで操作できる", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備：
    const key = "double-open.txt";
    const data = new TextEncoder().encode("double open");

    // 実行：
    await storage.open(createOpenContext() as IStorage.OpenContext);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

    // 検証：
    expect(storage.isOpen).toBe(true);
    await expect(
      storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).resolves.toStrictEqual(data);
  });

  test("close 後に open し直しても同じインスタンスでデータを読み取れる", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備：
    const key = "reopen-same-instance.bin";
    const data = new Uint8Array([9, 8, 7, 6]);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

    // 実行：
    storage.close(createCloseContext() as IStorage.CloseContext);
    await storage.open(createOpenContext() as IStorage.OpenContext);

    // 検証：
    expect(storage.isOpen).toBe(true);
    await expect(
      storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).resolves.toStrictEqual(data);
  });

  test("別インスタンスから同じバケットのデータを読み取れる", async ({
    bucket,
    expect,
    signal,
    storage,
    endpoint,
  }) => {
    // 準備：
    const key = "shared-bucket.bin";
    const data = new Uint8Array([1, 3, 5, 7]);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

    const other = new S3(bucket, createClientConfig(endpoint));
    await other.open(createOpenContext() as IStorage.OpenContext);

    try {
      // 実行：
      const result = await other.read(createGetContext(key, { signal }) as IStorage.ReadContext);

      // 検証：
      expect(result).toStrictEqual(data);
    } finally {
      other.close(createCloseContext() as IStorage.CloseContext);
    }
  });

  test("close 後の write は TypeError で拒否される", async ({ expect, signal, storage }) => {
    // 準備：
    storage.close(createCloseContext() as IStorage.CloseContext);

    // 実行と検証：
    await expect(
      storage.write(
        createSetContext("after-close.bin", { signal }) as IStorage.WriteContext,
        new Uint8Array([1]),
      ),
    ).rejects.toThrow(TypeError);
  });

  test("close 後の read は TypeError で拒否される", async ({ expect, signal, storage }) => {
    // 準備：
    storage.close(createCloseContext() as IStorage.CloseContext);

    // 実行と検証：
    await expect(
      storage.read(createGetContext("after-close.bin", { signal }) as IStorage.ReadContext),
    ).rejects.toThrow(TypeError);
  });

  test("close 後の exists は TypeError で拒否される", async ({ expect, signal, storage }) => {
    // 準備：
    storage.close(createCloseContext() as IStorage.CloseContext);

    // 実行と検証：
    await expect(
      storage.exists(createHasContext("after-close.bin", { signal }) as IStorage.ExistsContext),
    ).rejects.toThrow(TypeError);
  });

  test("close 後の delete は TypeError で拒否される", async ({ expect, signal, storage }) => {
    // 準備：
    storage.close(createCloseContext() as IStorage.CloseContext);

    // 実行と検証：
    await expect(
      storage.delete(createDeleteContext("after-close.bin", { signal }) as IStorage.DeleteContext),
    ).rejects.toThrow(TypeError);
  });

  test("close 後の clear は TypeError で拒否される", async ({ expect, signal, storage }) => {
    // 準備：
    storage.close(createCloseContext() as IStorage.CloseContext);

    // 実行と検証：
    await expect(
      storage.clear(createClearContext("", { signal }) as IStorage.ClearContext),
    ).rejects.toThrow(TypeError);
  });

  test("close 後の getWritable は同期エラーになる", ({ expect, signal, storage }) => {
    // 準備：
    storage.close(createCloseContext() as IStorage.CloseContext);

    // 実行と検証：
    expect(() =>
      storage.getWritable(
        createSetContext("after-close.bin", { signal }) as IStorage.GetWritableContext,
      ),
    ).toThrow(TypeError);
  });

  test("close 後の getReadable は同期エラーになる", ({ expect, signal, storage }) => {
    // 準備：
    storage.close(createCloseContext() as IStorage.CloseContext);

    // 実行と検証：
    expect(() =>
      storage.getReadable(
        createStreamContext("after-close.bin", { signal }) as IStorage.GetReadableContext,
      ),
    ).toThrow(TypeError);
  });

  test("clear した後に close と open をしてもデータは戻らない", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備：
    const key = "cleared.bin";
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

    // 実行：
    storage.close(createCloseContext() as IStorage.CloseContext);
    await storage.open(createOpenContext() as IStorage.OpenContext);

    // 検証：
    await expect(
      storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext),
    ).resolves.toBe(false);
  });
});
