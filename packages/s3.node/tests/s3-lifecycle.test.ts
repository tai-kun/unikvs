import { S3Client } from "@aws-sdk/client-s3";
import { describe, vi } from "vitest";

import S3 from "../src/s3.js";
import { createClientConfig, test } from "./_helpers.js";

describe("ライフサイクル管理", () => {
  test("ストレージ名は S3 である", ({ expect, storage }) => {
    // 準備と実行は constructor で完了している。

    // 検証
    expect(storage.name).toBe("S3");
  });

  test("open を 2 回呼び出しても isOpen は true のままで操作できる", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "double-open.txt";
    const data = new TextEncoder().encode("double open");
    storage.open();

    // 実行
    storage.open();
    await storage.write({ key, data, signal, vars: {} });

    // 検証
    expect(storage.isOpen).toBe(true);
    await expect(storage.read({ key, signal })).resolves.toStrictEqual(data);
  });

  test("open と close を繰り返しても書き込んだデータは保持される", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const entries = [
      { key: "cycle-1.bin", data: new Uint8Array([1, 2, 3]) },
      { key: "cycle-2.bin", data: new Uint8Array([4, 5]) },
      { key: "cycle-3.bin", data: new Uint8Array([6]) },
    ];
    storage.open();

    // 実行
    for (const { key, data } of entries) {
      await storage.write({ key, data, signal, vars: {} });
      storage.close();
      storage.open();
    }

    // 検証
    for (const { key, data } of entries) {
      await expect(storage.read({ key, signal })).resolves.toStrictEqual(data);
    }
  });

  test("close を呼び出すと保持している S3Client が破棄される", ({ expect, storage }) => {
    // 準備
    storage.open();
    const destroy = vi.spyOn(S3Client.prototype, "destroy");

    try {
      // 実行
      storage.close();

      // 検証
      expect(destroy).toHaveBeenCalledTimes(1);
    } finally {
      destroy.mockRestore();
    }
  });

  test("close 後の write は null 参照エラーで拒否される", async ({ expect, signal, storage }) => {
    // 準備
    storage.open();
    storage.close();

    // 実行と検証
    await expect(
      storage.write({ key: "after-close.bin", data: new Uint8Array([1]), signal, vars: {} }),
    ).rejects.toThrow(TypeError);
  });

  test("close 後の read は null 参照エラーで拒否される", async ({ expect, signal, storage }) => {
    // 準備
    storage.open();
    storage.close();

    // 実行と検証
    await expect(storage.read({ key: "after-close.bin", signal })).rejects.toThrow(TypeError);
  });

  test("close 後の exists は null 参照エラーで拒否される", async ({ expect, signal, storage }) => {
    // 準備
    storage.open();
    storage.close();

    // 実行と検証
    await expect(storage.exists({ key: "after-close.bin", signal })).rejects.toThrow(TypeError);
  });

  test("close 後の delete は null 参照エラーで拒否される", async ({ expect, signal, storage }) => {
    // 準備
    storage.open();
    storage.close();

    // 実行と検証
    await expect(storage.delete({ key: "after-close.bin", signal })).rejects.toThrow(TypeError);
  });

  test("close 後の clear は null 参照エラーで拒否される", async ({ expect, signal, storage }) => {
    // 準備
    storage.open();
    storage.close();

    // 実行と検証
    await expect(storage.clear({ signal })).rejects.toThrow(TypeError);
  });

  test("close 後の getWritable は同期エラーになる", ({ expect, signal, storage }) => {
    // 準備
    storage.open();
    storage.close();

    // 実行と検証
    expect(() => storage.getWritable({ key: "after-close.bin", vars: {}, signal })).toThrow(
      /AWS client/,
    );
  });

  test("close を 2 回呼び出すと 2 回目は TypeError になる", ({ expect, storage }) => {
    // 準備
    storage.open();
    storage.close();

    // 実行と検証
    expect(() => storage.close()).toThrow(TypeError);
  });

  test("close して open し直しても同じインスタンスでデータを読み取れる", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "reopen-same-instance.bin";
    const data = new Uint8Array([9, 8, 7, 6]);
    storage.open();
    await storage.write({ key, data, signal, vars: {} });

    // 実行
    storage.close();
    storage.open();

    // 検証
    await expect(storage.read({ key, signal })).resolves.toStrictEqual(data);
  });

  test("別インスタンスから同じバケットのデータを読み取れる", async ({
    bucket,
    endpoint,
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "shared-bucket.bin";
    const data = new Uint8Array([1, 3, 5, 7]);
    storage.open();
    await storage.write({ key, data, signal, vars: {} });
    storage.close();

    const other = new S3(bucket, createClientConfig(endpoint));
    other.open();

    // 実行
    const result = await other.read({ key, signal });

    // 検証
    other.close();
    expect(result).toStrictEqual(data);
  });

  test("clear した後に close と open をしてもデータは戻らない", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "cleared.bin";
    storage.open();
    await storage.write({ key, data: new Uint8Array([1]), signal, vars: {} });
    await storage.clear({ signal });

    // 実行
    storage.close();
    storage.open();

    // 検証
    await expect(storage.exists({ key, signal })).resolves.toBe(false);
    await expect(storage.read({ key, signal })).rejects.toThrow(/NoSuchKey|does not exist/);
  });
});
