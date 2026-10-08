import { InvalidUsageErrorBase } from "@unikvs/core";
import { describe } from "vitest";

import {
  InvalidPartSizeError,
  StorageAbortedError,
  StorageNotOpenError,
  UnsupportedRuntimeError,
} from "../src/errors.js";
import S3 from "../src/s3.js";
import { acquireFreePort, collectBytes, createClientConfig, test } from "./_helpers.js";

describe("エラークラス", () => {
  test("UnsupportedRuntimeError は name と基本メッセージを持つ", ({ expect }) => {
    // 準備と実行
    const error = new UnsupportedRuntimeError();

    // 検証
    expect(error).toBeInstanceOf(InvalidUsageErrorBase);
    expect(error.name).toBe("S3UnsupportedRuntimeError");
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
    expect(error.name).toBe("S3InvalidPartSizeError");
    expect(error.meta).toStrictEqual({ actual: "不正な値" });
    expect(error.message).toContain("Invalid part size 不正な値");
  });

  test("StorageAbortedError は name・meta・メッセージを持つ", ({ expect }) => {
    // 準備と実行
    const error = new StorageAbortedError({ key: "k1" });

    // 検証
    expect(error.name).toBe("S3StorageAbortedError");
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
    await missing.open();

    try {
      // 実行と検証
      await expect(
        missing.write({ key: "x.bin", data: new Uint8Array([1]), signal, vars: {} }),
      ).rejects.toMatchObject({ code: "NoSuchBucket" });
      await expect(missing.read({ key: "x.bin", signal })).rejects.toMatchObject({
        code: "NoSuchBucket",
      });
      await expect(missing.delete({ key: "x.bin", signal })).rejects.toMatchObject({
        code: "NoSuchBucket",
      });
      await expect(missing.clear({ signal })).rejects.toMatchObject({ code: "NoSuchBucket" });
      await expect(
        collectBytes(missing.getReadable({ key: "x.bin", signal })),
      ).rejects.toMatchObject({ code: "NoSuchBucket" });
    } finally {
      missing.close();
    }
  });

  test("存在しないバケットの exists は false を返す", async ({ endpoint, expect, signal }) => {
    // 準備
    const missing = new S3("no-such-bucket", createClientConfig(endpoint));
    await missing.open();

    try {
      // 実行
      const result = await missing.exists({ key: "x.bin", signal });

      // 検証
      expect(result).toBe(false);
    } finally {
      missing.close();
    }
  });

  test("到達不能なエンドポイントへの write と exists は接続エラーで拒否される", async ({
    expect,
    signal,
  }) => {
    // 準備
    const port = await acquireFreePort();
    const unreachable = new S3("any-bucket", createClientConfig(`http://127.0.0.1:${port}`));
    await unreachable.open();

    try {
      // 実行と検証
      await expect(
        unreachable.write({ key: "x.bin", data: new Uint8Array([1]), signal, vars: {} }),
      ).rejects.toMatchObject({ code: "ConnectionRefused" });
      await expect(unreachable.exists({ key: "x.bin", signal })).rejects.toMatchObject({
        code: "ConnectionRefused",
      });
    } finally {
      unreachable.close();
    }
  });

  test("権限のない認証情報での write/read/delete/clear/getReadable は拒否される", async ({
    expect,
    signal,
    unauthorizedStorage,
  }) => {
    // 実行と検証
    await expect(
      unauthorizedStorage.write({ key: "x.bin", data: new Uint8Array([1]), signal, vars: {} }),
    ).rejects.toMatchObject({ code: "InvalidAccessKeyId" });
    await expect(unauthorizedStorage.read({ key: "x.bin", signal })).rejects.toMatchObject({
      code: "InvalidAccessKeyId",
    });
    await expect(unauthorizedStorage.delete({ key: "x.bin", signal })).rejects.toMatchObject({
      code: "InvalidAccessKeyId",
    });
    await expect(unauthorizedStorage.clear({ signal })).rejects.toMatchObject({
      code: "InvalidAccessKeyId",
    });
    await expect(
      collectBytes(unauthorizedStorage.getReadable({ key: "x.bin", signal })),
    ).rejects.toMatchObject({ code: "InvalidAccessKeyId" });
  });

  test("権限のない認証情報の exists は false を返さずエラーになる", async ({
    expect,
    signal,
    unauthorizedStorage,
  }) => {
    // 実行と検証
    await expect(unauthorizedStorage.exists({ key: "x.bin", signal })).rejects.toThrow();
  });
});
