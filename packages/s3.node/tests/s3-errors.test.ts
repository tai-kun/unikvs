import { describe } from "vitest";

import S3 from "../src/s3.js";
import { acquireFreePort, createClientConfig, test } from "./_helpers.js";

describe("異常系とエラー伝播", () => {
  test("存在しないバケットへの write/delete/clear/getReadable は NoSuchBucket で拒否される", async ({
    bucket,
    endpoint,
    expect,
    signal,
  }) => {
    // 準備
    const missing = new S3(bucket, createClientConfig(endpoint));
    missing.open();

    try {
      // 実行と検証
      await expect(
        missing.write({ key: "x.bin", data: new Uint8Array([1]), signal }),
      ).rejects.toMatchObject({ name: "NoSuchBucket" });
      await expect(missing.delete({ key: "x.bin", signal })).rejects.toMatchObject({
        name: "NoSuchBucket",
      });
      await expect(missing.clear({ signal })).rejects.toMatchObject({ name: "NoSuchBucket" });
      await expect(missing.getReadable({ key: "x.bin", signal })).rejects.toMatchObject({
        name: "NoSuchBucket",
      });
    } finally {
      missing.close();
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
    missing.open();

    // 実行
    const result = await missing.exists({ key: "x.bin", signal });

    // 検証
    missing.close();
    expect(result).toBe(false);
  });

  test("到達不能なエンドポイントへの write と exists は接続エラーで拒否される", async ({
    expect,
    signal,
  }) => {
    // 準備
    const port = await acquireFreePort();
    const unreachable = new S3("any-bucket", createClientConfig(`http://127.0.0.1:${port}`));
    unreachable.open();

    try {
      // 実行と検証
      await expect(
        unreachable.write({ key: "x.bin", data: new Uint8Array([1]), signal }),
      ).rejects.toThrow(/ECONNREFUSED|fetch failed/);
      await expect(unreachable.exists({ key: "x.bin", signal })).rejects.toThrow(
        /ECONNREFUSED|fetch failed/,
      );
    } finally {
      unreachable.close();
    }
  });

  test("権限のない認証情報での write/read/delete/clear/getReadable は拒否される", async ({
    expect,
    signal,
    unauthorizedStorage,
  }) => {
    // 準備
    unauthorizedStorage.open();

    // 実行と検証
    await expect(
      unauthorizedStorage.write({ key: "x.bin", data: new Uint8Array([1]), signal }),
    ).rejects.toThrow();
    await expect(unauthorizedStorage.read({ key: "x.bin", signal })).rejects.toThrow();
    await expect(unauthorizedStorage.delete({ key: "x.bin", signal })).rejects.toThrow();
    await expect(unauthorizedStorage.clear({ signal })).rejects.toThrow();
    await expect(unauthorizedStorage.getReadable({ key: "x.bin", signal })).rejects.toThrow();
  });

  test("権限のない認証情報の exists は false を返さずエラーになる", async ({
    expect,
    signal,
    unauthorizedStorage,
  }) => {
    // 準備
    unauthorizedStorage.open();

    // 実行と検証
    await expect(unauthorizedStorage.exists({ key: "x.bin", signal })).rejects.toThrow();
  });
});
