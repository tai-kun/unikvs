import { InvalidUsageErrorBase, type IStorage } from "@unikvs/core";
import {
  collectBytes,
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

import {
  InvalidPartSizeError,
  StorageAbortedError,
  StorageNotOpenError,
  UnsupportedRuntimeError,
} from "../src/errors.js";
import S3 from "../src/s3.js";
import { createClientConfig, test } from "./_helpers.js";

describe("エラークラス", () => {
  test("UnsupportedRuntimeError は name と基本メッセージを持つ", ({ expect }) => {
    // 準備と実行
    const error = new UnsupportedRuntimeError({ name: "S3", runtime: "Bun" });

    // 検証
    expect(error).toBeInstanceOf(InvalidUsageErrorBase);
    expect(error.name).toBe("UniKvsUnsupportedRuntimeError");
    expect(error.message).toBe("S3 can only be used in the Bun runtime");
  });

  test("StorageNotOpenError は name と基本メッセージを持つ", ({ expect }) => {
    // 準備と実行
    const error = new StorageNotOpenError();

    // 検証
    expect(error).toBeInstanceOf(InvalidUsageErrorBase);
    expect(error.name).toBe("S3StorageNotOpenError");
    expect(error.message).toBe("The S3 client is not open. Call open() before close().");
  });

  test("InvalidPartSizeError は name・meta・メッセージを持つ", ({ expect }) => {
    // 準備と実行
    const error = new InvalidPartSizeError({ actual: "不正な値" });

    // 検証
    expect(error.name).toBe("UniKvsInvalidPartSizeError");
    expect(error.meta).toStrictEqual({ actual: "不正な値" });
    expect(error.message).toContain("Invalid part size 不正な値");
  });

  test("StorageAbortedError は name・meta・メッセージを持つ", ({ expect }) => {
    // 準備と実行
    const error = new StorageAbortedError({ key: "k1" });

    // 検証
    expect(error.name).toBe("UniKvsStorageAbortedError");
    expect(error.meta).toStrictEqual({ key: "k1" });
    expect(error.message).toContain('The upload for key "k1" was aborted');
  });
});

describe("異常系とエラー伝播", () => {
  test("存在しないバケットへの write/read/delete/clear/getReadable は NoSuchBucket で拒否される", async ({
    endpoint,
    expect,
    signal,
  }) => {
    // 準備
    const missing = new S3("no-such-bucket", createClientConfig(endpoint));
    await missing.open(createOpenContext() as IStorage.OpenContext);

    try {
      // 実行と検証
      await expect(
        missing.write(
          createSetContext("x.bin", { signal }) as IStorage.WriteContext,
          new Uint8Array([1]),
        ),
      ).rejects.toMatchObject({ code: "NoSuchBucket" });
      await expect(
        missing.read(createGetContext("x.bin", { signal }) as IStorage.ReadContext),
      ).rejects.toMatchObject({
        code: "NoSuchBucket",
      });
      await expect(
        missing.delete(createDeleteContext("x.bin", { signal }) as IStorage.DeleteContext),
      ).rejects.toMatchObject({
        code: "NoSuchBucket",
      });
      await expect(
        missing.clear(createClearContext("", { signal }) as IStorage.ClearContext),
      ).rejects.toMatchObject({ code: "NoSuchBucket" });
      await expect(
        collectBytes(
          missing.getReadable(
            createStreamContext("x.bin", { signal }) as IStorage.GetReadableContext,
          ),
        ),
      ).rejects.toMatchObject({ code: "NoSuchBucket" });
    } finally {
      missing.close(createCloseContext() as IStorage.CloseContext);
    }
  });

  test("存在しないバケットの exists は false を返す", async ({ endpoint, expect, signal }) => {
    // 準備
    const missing = new S3("no-such-bucket", createClientConfig(endpoint));
    await missing.open(createOpenContext() as IStorage.OpenContext);

    try {
      // 実行
      const result = await missing.exists(
        createHasContext("x.bin", { signal }) as IStorage.ExistsContext,
      );

      // 検証
      expect(result).toBe(false);
    } finally {
      missing.close(createCloseContext() as IStorage.CloseContext);
    }
  });

  test("到達不能なエンドポイントへの write と exists は接続エラーで拒否される", async ({
    expect,
    signal,
  }) => {
    // 準備
    const port = await acquireFreePort();
    const unreachable = new S3("any-bucket", createClientConfig(`http://127.0.0.1:${port}`));
    await unreachable.open(createOpenContext() as IStorage.OpenContext);

    try {
      // 実行と検証
      await expect(
        unreachable.write(
          createSetContext("x.bin", { signal }) as IStorage.WriteContext,
          new Uint8Array([1]),
        ),
      ).rejects.toMatchObject({ code: "ConnectionRefused" });
      await expect(
        unreachable.exists(createHasContext("x.bin", { signal }) as IStorage.ExistsContext),
      ).rejects.toMatchObject({
        code: "ConnectionRefused",
      });
    } finally {
      unreachable.close(createCloseContext() as IStorage.CloseContext);
    }
  });

  test("権限のない認証情報での write/read/delete/clear/getReadable は拒否される", async ({
    expect,
    signal,
    unauthorizedStorage,
  }) => {
    // 実行と検証
    await expect(
      unauthorizedStorage.write(
        createSetContext("x.bin", { signal }) as IStorage.WriteContext,
        new Uint8Array([1]),
      ),
    ).rejects.toMatchObject({ code: "InvalidAccessKeyId" });
    await expect(
      unauthorizedStorage.read(createGetContext("x.bin", { signal }) as IStorage.ReadContext),
    ).rejects.toMatchObject({
      code: "InvalidAccessKeyId",
    });
    await expect(
      unauthorizedStorage.delete(
        createDeleteContext("x.bin", { signal }) as IStorage.DeleteContext,
      ),
    ).rejects.toMatchObject({
      code: "InvalidAccessKeyId",
    });
    await expect(
      unauthorizedStorage.clear(createClearContext("", { signal }) as IStorage.ClearContext),
    ).rejects.toMatchObject({
      code: "InvalidAccessKeyId",
    });
    await expect(
      collectBytes(
        unauthorizedStorage.getReadable(
          createStreamContext("x.bin", { signal }) as IStorage.GetReadableContext,
        ),
      ),
    ).rejects.toMatchObject({ code: "InvalidAccessKeyId" });
  });

  test("権限のない認証情報の exists は false を返さずエラーになる", async ({
    expect,
    signal,
    unauthorizedStorage,
  }) => {
    // 実行と検証
    await expect(
      unauthorizedStorage.exists(createHasContext("x.bin", { signal }) as IStorage.ExistsContext),
    ).rejects.toThrow();
  });
});
