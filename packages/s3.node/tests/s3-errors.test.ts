import type { IStorage } from "@unikvs/core";
import {
  createClearContext,
  createCloseContext,
  createDeleteContext,
  createGetContext,
  createHasContext,
  createOpenContext,
  createSetContext,
  createStreamContext,
} from "@unikvs/testing";
import { acquireFreePort } from "@unikvs/testing/node";
import { describe } from "vitest";

import S3 from "../src/s3.js";
import { createClientConfig, test } from "./_helpers.js";

describe("異常系とエラー伝播", () => {
  test("存在しないバケットへの write/delete/clear/getReadable は NoSuchBucket で拒否される", async ({
    bucket,
    endpoint,
    expect,
    signal,
  }) => {
    // 準備
    const missing = new S3(bucket, createClientConfig(endpoint));
    missing.open(createOpenContext() as IStorage.OpenContext);

    try {
      // 実行と検証
      await expect(
        missing.write(
          createSetContext("x.bin", { signal }) as IStorage.WriteContext,
          new Uint8Array([1]),
        ),
      ).rejects.toMatchObject({ name: "NoSuchBucket" });
      await expect(
        missing.delete(createDeleteContext("x.bin", { signal }) as IStorage.DeleteContext),
      ).rejects.toMatchObject({
        name: "NoSuchBucket",
      });
      await expect(
        missing.clear(createClearContext("", { signal }) as IStorage.ClearContext),
      ).rejects.toMatchObject({ name: "NoSuchBucket" });
      await expect(
        missing.getReadable(
          createStreamContext("x.bin", { signal }) as IStorage.GetReadableContext,
        ),
      ).rejects.toMatchObject({
        name: "NoSuchBucket",
      });
    } finally {
      missing.close(createCloseContext() as IStorage.CloseContext);
    }
  });

  test("存在しないバケットの exists は 404 として false を返す", async ({
    bucket,
    endpoint,
    expect,
    signal,
  }) => {
    // 準備
    const missing = new S3(bucket, createClientConfig(endpoint));
    missing.open(createOpenContext() as IStorage.OpenContext);

    // 実行
    const result = await missing.exists(
      createHasContext("x.bin", { signal }) as IStorage.ExistsContext,
    );

    // 検証
    missing.close(createCloseContext() as IStorage.CloseContext);
    expect(result).toBe(false);
  });

  test("到達不能なエンドポイントへの write と exists は接続エラーで拒否される", async ({
    expect,
    signal,
  }) => {
    // 準備
    const port = await acquireFreePort();
    const unreachable = new S3("any-bucket", createClientConfig(`http://127.0.0.1:${port}`));
    unreachable.open(createOpenContext() as IStorage.OpenContext);

    try {
      // 実行と検証
      await expect(
        unreachable.write(
          createSetContext("x.bin", { signal }) as IStorage.WriteContext,
          new Uint8Array([1]),
        ),
      ).rejects.toThrow(/ECONNREFUSED|fetch failed/);
      await expect(
        unreachable.exists(createHasContext("x.bin", { signal }) as IStorage.ExistsContext),
      ).rejects.toThrow(/ECONNREFUSED|fetch failed/);
    } finally {
      unreachable.close(createCloseContext() as IStorage.CloseContext);
    }
  });

  test("権限のない認証情報での write/read/delete/clear/getReadable は拒否される", async ({
    expect,
    signal,
    unauthorizedStorage,
  }) => {
    // 準備
    unauthorizedStorage.open(createOpenContext() as IStorage.OpenContext);

    // 実行と検証
    await expect(
      unauthorizedStorage.write(
        createSetContext("x.bin", { signal }) as IStorage.WriteContext,
        new Uint8Array([1]),
      ),
    ).rejects.toThrow();
    await expect(
      unauthorizedStorage.read(createGetContext("x.bin", { signal }) as IStorage.ReadContext),
    ).rejects.toThrow();
    await expect(
      unauthorizedStorage.delete(
        createDeleteContext("x.bin", { signal }) as IStorage.DeleteContext,
      ),
    ).rejects.toThrow();
    await expect(
      unauthorizedStorage.clear(createClearContext("", { signal }) as IStorage.ClearContext),
    ).rejects.toThrow();
    await expect(
      unauthorizedStorage.getReadable(
        createStreamContext("x.bin", { signal }) as IStorage.GetReadableContext,
      ),
    ).rejects.toThrow();
  });

  test("権限のない認証情報の exists は false を返さずエラーになる", async ({
    expect,
    signal,
    unauthorizedStorage,
  }) => {
    // 準備
    unauthorizedStorage.open(createOpenContext() as IStorage.OpenContext);

    // 実行と検証
    await expect(
      unauthorizedStorage.exists(createHasContext("x.bin", { signal }) as IStorage.ExistsContext),
    ).rejects.toThrow();
  });
});
