import { S3Client } from "@aws-sdk/client-s3";
import type { IStorage } from "@unikvs/core";
import {
  createGetContext,
  createHasContext,
  createSetContext,
  createOpenContext,
  createClearContext,
  createCloseContext,
  createDeleteContext,
} from "@unikvs/testing";
import { vi, describe } from "vite-plus/test";

import S3 from "../src/s3.js";
import { test, createClientConfig } from "./_helpers.js";

describe("ライフサイクル管理", () => {
  test("ストレージ名は S3 である", ({ expect, storage }) => {
    // 準備と実行は constructor で完了している。

    // 検証：
    expect(storage.name).toBe("S3");
  });

  test("open を 2 回呼び出しても isOpen は true のままで操作できる", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備：
    const key = "double-open.txt";
    const data = new TextEncoder().encode("double open");

    storage.open(createOpenContext() as IStorage.OpenContext);

    // 実行：
    storage.open(createOpenContext() as IStorage.OpenContext);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

    // 検証：
    expect(storage.isOpen).toBe(true);
    await expect(
      storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).resolves.toStrictEqual(data);
  });

  test("open と close を繰り返しても書き込んだデータは保持される", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備：
    const entries = [
      {
        key: "cycle-1.bin",
        data: new Uint8Array([1, 2, 3]),
      },
      {
        key: "cycle-2.bin",
        data: new Uint8Array([4, 5]),
      },
      {
        key: "cycle-3.bin",
        data: new Uint8Array([6]),
      },
    ];

    storage.open(createOpenContext() as IStorage.OpenContext);

    // 実行：
    for (const { key, data } of entries) {
      await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);
      storage.close(createCloseContext() as IStorage.CloseContext);
      storage.open(createOpenContext() as IStorage.OpenContext);
    }

    // 検証：
    for (const { key, data } of entries) {
      await expect(
        storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
      ).resolves.toStrictEqual(data);
    }
  });

  test("close を呼び出すと保持している S3Client が破棄される", ({ expect, storage }) => {
    // 準備：
    storage.open(createOpenContext() as IStorage.OpenContext);
    const destroy = vi.spyOn(S3Client.prototype, "destroy");

    try {
      // 実行：
      storage.close(createCloseContext() as IStorage.CloseContext);

      // 検証：
      expect(destroy).toHaveBeenCalledTimes(1);
    } finally {
      destroy.mockRestore();
    }
  });

  test("close 後の write は null 参照エラーで拒否される", async ({ expect, signal, storage }) => {
    // 準備：
    storage.open(createOpenContext() as IStorage.OpenContext);
    storage.close(createCloseContext() as IStorage.CloseContext);

    // 実行と検証：
    await expect(
      storage.write(
        createSetContext("after-close.bin", { signal }) as IStorage.WriteContext,
        new Uint8Array([1]),
      ),
    ).rejects.toThrow(TypeError);
  });

  test("close 後の read は null 参照エラーで拒否される", async ({ expect, signal, storage }) => {
    // 準備：
    storage.open(createOpenContext() as IStorage.OpenContext);
    storage.close(createCloseContext() as IStorage.CloseContext);

    // 実行と検証：
    await expect(
      storage.read(createGetContext("after-close.bin", { signal }) as IStorage.ReadContext),
    ).rejects.toThrow(TypeError);
  });

  test("close 後の exists は null 参照エラーで拒否される", async ({ expect, signal, storage }) => {
    // 準備：
    storage.open(createOpenContext() as IStorage.OpenContext);
    storage.close(createCloseContext() as IStorage.CloseContext);

    // 実行と検証：
    await expect(
      storage.exists(createHasContext("after-close.bin", { signal }) as IStorage.ExistsContext),
    ).rejects.toThrow(TypeError);
  });

  test("close 後の delete は null 参照エラーで拒否される", async ({ expect, signal, storage }) => {
    // 準備：
    storage.open(createOpenContext() as IStorage.OpenContext);
    storage.close(createCloseContext() as IStorage.CloseContext);

    // 実行と検証：
    await expect(
      storage.delete(createDeleteContext("after-close.bin", { signal }) as IStorage.DeleteContext),
    ).rejects.toThrow(TypeError);
  });

  test("close 後の clear は null 参照エラーで拒否される", async ({ expect, signal, storage }) => {
    // 準備：
    storage.open(createOpenContext() as IStorage.OpenContext);
    storage.close(createCloseContext() as IStorage.CloseContext);

    // 実行と検証：
    await expect(
      storage.clear(createClearContext("", { signal }) as IStorage.ClearContext),
    ).rejects.toThrow(TypeError);
  });

  test("close 後の getWritable は同期エラーになる", ({ expect, signal, storage }) => {
    // 準備：
    storage.open(createOpenContext() as IStorage.OpenContext);
    storage.close(createCloseContext() as IStorage.CloseContext);

    // 実行と検証：
    expect(() =>
      storage.getWritable(
        createSetContext("after-close.bin", { signal }) as IStorage.GetWritableContext,
      ),
    ).toThrow(/AWS client/u);
  });

  test("close を 2 回呼び出すと 2 回目は TypeError になる", ({ expect, storage }) => {
    // 準備：
    storage.open(createOpenContext() as IStorage.OpenContext);
    storage.close(createCloseContext() as IStorage.CloseContext);

    // 実行と検証：
    expect(() => {
      storage.close(createCloseContext() as IStorage.CloseContext);
    }).toThrow(TypeError);
  });

  test("close して open し直しても同じインスタンスでデータを読み取れる", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備：
    const key = "reopen-same-instance.bin";
    const data = new Uint8Array([9, 8, 7, 6]);

    storage.open(createOpenContext() as IStorage.OpenContext);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

    // 実行：
    storage.close(createCloseContext() as IStorage.CloseContext);
    storage.open(createOpenContext() as IStorage.OpenContext);

    // 検証：
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

    storage.open(createOpenContext() as IStorage.OpenContext);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);
    storage.close(createCloseContext() as IStorage.CloseContext);

    const other = new S3(bucket, createClientConfig(endpoint));
    other.open(createOpenContext() as IStorage.OpenContext);

    // 実行：
    const result = await other.read(createGetContext(key, { signal }) as IStorage.ReadContext);

    // 検証：
    other.close(createCloseContext() as IStorage.CloseContext);
    expect(result).toStrictEqual(data);
  });

  test("clear した後に close と open をしてもデータは戻らない", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備：
    const key = "cleared.bin";

    storage.open(createOpenContext() as IStorage.OpenContext);
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await storage.clear(createClearContext("", { signal }) as IStorage.ClearContext);

    // 実行：
    storage.close(createCloseContext() as IStorage.CloseContext);
    storage.open(createOpenContext() as IStorage.OpenContext);

    // 検証：
    await expect(
      storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext),
    ).resolves.toBe(false);
    await expect(
      storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).rejects.toThrow(/NoSuchKey|does not exist/u);
  });
});
