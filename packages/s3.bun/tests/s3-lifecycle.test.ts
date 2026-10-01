import { describe } from "vitest";

import { StorageNotOpenError } from "../src/errors.js";
import S3 from "../src/s3.js";
import { createClientConfig, test } from "./_helpers.js";

describe("ライフサイクル管理", () => {
  test("ストレージ名は S3 である", ({ expect, storage }) => {
    // 準備と実行は constructor で完了している。

    // 検証
    expect(storage.name).toBe("S3");
  });

  test("インスタンス化した直後は、isOpen が false である", ({ bucket, endpoint, expect }) => {
    // 準備
    const unopened = new S3(bucket, createClientConfig(endpoint));

    // 実行と検証
    expect(unopened.isOpen).toBe(false);
  });

  test("open を呼び出すと、isOpen が true になる", ({ expect, storage }) => {
    // 準備と実行はフィクスチャーで完了している。

    // 検証
    expect(storage.isOpen).toBe(true);
  });

  test("close を呼び出すと、isOpen が false に戻る", ({ expect, storage }) => {
    // 実行
    storage.close();

    // 検証
    expect(storage.isOpen).toBe(false);
  });

  test("close を 2 回呼び出すと 2 回目は StorageNotOpenError になる", ({ expect, storage }) => {
    // 準備
    storage.close();

    // 実行と検証
    expect(() => storage.close()).toThrow(StorageNotOpenError);
  });

  test("open を 2 回呼び出しても isOpen は true のままで操作できる", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "double-open.txt";
    const data = new TextEncoder().encode("double open");

    // 実行
    await storage.open();
    await storage.write({ key, data, signal });

    // 検証
    expect(storage.isOpen).toBe(true);
    await expect(storage.read({ key, signal })).resolves.toStrictEqual(data);
  });

  test("close 後に open し直しても同じインスタンスでデータを読み取れる", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "reopen-same-instance.bin";
    const data = new Uint8Array([9, 8, 7, 6]);
    await storage.write({ key, data, signal });

    // 実行
    storage.close();
    await storage.open();

    // 検証
    expect(storage.isOpen).toBe(true);
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
    await storage.write({ key, data, signal });

    const other = new S3(bucket, createClientConfig(endpoint));
    await other.open();

    try {
      // 実行
      const result = await other.read({ key, signal });

      // 検証
      expect(result).toStrictEqual(data);
    } finally {
      other.close();
    }
  });

  test("close 後の write は TypeError で拒否される", async ({ expect, signal, storage }) => {
    // 準備
    storage.close();

    // 実行と検証
    await expect(
      storage.write({ key: "after-close.bin", data: new Uint8Array([1]), signal }),
    ).rejects.toThrow(TypeError);
  });

  test("close 後の read は TypeError で拒否される", async ({ expect, signal, storage }) => {
    // 準備
    storage.close();

    // 実行と検証
    await expect(storage.read({ key: "after-close.bin", signal })).rejects.toThrow(TypeError);
  });

  test("close 後の exists は TypeError で拒否される", async ({ expect, signal, storage }) => {
    // 準備
    storage.close();

    // 実行と検証
    await expect(storage.exists({ key: "after-close.bin", signal })).rejects.toThrow(TypeError);
  });

  test("close 後の delete は TypeError で拒否される", async ({ expect, signal, storage }) => {
    // 準備
    storage.close();

    // 実行と検証
    await expect(storage.delete({ key: "after-close.bin", signal })).rejects.toThrow(TypeError);
  });

  test("close 後の clear は TypeError で拒否される", async ({ expect, signal, storage }) => {
    // 準備
    storage.close();

    // 実行と検証
    await expect(storage.clear({ signal })).rejects.toThrow(TypeError);
  });

  test("close 後の getWritable は同期エラーになる", ({ expect, signal, storage }) => {
    // 準備
    storage.close();

    // 実行と検証
    expect(() => storage.getWritable({ key: "after-close.bin", vars: {}, signal })).toThrow(
      TypeError,
    );
  });

  test("close 後の getReadable は同期エラーになる", ({ expect, signal, storage }) => {
    // 準備
    storage.close();

    // 実行と検証
    expect(() => storage.getReadable({ key: "after-close.bin", signal })).toThrow(TypeError);
  });

  test("clear した後に close と open をしてもデータは戻らない", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "cleared.bin";
    await storage.write({ key, data: new Uint8Array([1]), signal });
    await storage.clear({ signal });

    // 実行
    storage.close();
    await storage.open();

    // 検証
    await expect(storage.exists({ key, signal })).resolves.toBe(false);
  });
});
