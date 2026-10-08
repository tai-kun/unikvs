import { RepairNotAllowedError } from "@unikvs/core";
import { describe } from "vitest";

import S3 from "../src/s3.js";
import { createClientConfig, test } from "./_helpers.js";

describe("S3 - 書き戻しの許可", () => {
  test("既定では書き戻しを拒否する", async ({ bucket, endpoint, expect, signal }) => {
    // 準備
    const storage = new S3(bucket, createClientConfig(endpoint));
    await storage.open();

    try {
      // 実行と検証
      expect(storage.allowRepair).toBe(false);
      await expect(
        storage.write({
          key: "a",
          data: new Uint8Array([1, 2, 3]),
          signal,
          vars: { "unikvs:repair": true },
        }),
      ).rejects.toThrow(RepairNotAllowedError);
      await expect(storage.exists({ key: "a", signal })).resolves.toBe(false);
    } finally {
      storage.close();
    }
  });

  test("allowRepair: true では書き戻しを受け付ける", async ({
    bucket,
    endpoint,
    expect,
    signal,
  }) => {
    // 準備
    const storage = new S3(bucket, { ...createClientConfig(endpoint), allowRepair: true });
    await storage.open();

    try {
      // 実行と検証
      expect(storage.allowRepair).toBe(true);
      const data = new Uint8Array([1, 2, 3]);
      await storage.write({ key: "a", data, signal, vars: { "unikvs:repair": true } });
      await expect(storage.read({ key: "a", signal })).resolves.toStrictEqual(data);
    } finally {
      storage.close();
    }
  });

  test("allowRepair: false では書き戻しの write を拒否する", async ({
    bucket,
    endpoint,
    expect,
    signal,
  }) => {
    // 準備
    const storage = new S3(bucket, { ...createClientConfig(endpoint), allowRepair: false });
    await storage.open();

    try {
      // 実行と検証
      expect(storage.allowRepair).toBe(false);
      await expect(
        storage.write({
          key: "a",
          data: new Uint8Array([1, 2, 3]),
          signal,
          vars: { "unikvs:repair": true },
        }),
      ).rejects.toThrow(RepairNotAllowedError);
      await expect(storage.exists({ key: "a", signal })).resolves.toBe(false);
    } finally {
      storage.close();
    }
  });

  test("allowRepair: false でも通常の write は受け付ける", async ({
    bucket,
    endpoint,
    expect,
    signal,
  }) => {
    // 準備
    const storage = new S3(bucket, { ...createClientConfig(endpoint), allowRepair: false });
    await storage.open();

    try {
      // 実行と検証: 目印なしの書き込みは影響を受けない
      const dataA = new Uint8Array([1, 2, 3]);
      const dataB = new Uint8Array([4, 5]);
      await storage.write({ key: "a", data: dataA, signal, vars: {} });
      await storage.write({ key: "b", data: dataB, signal, vars: {} });

      // 検証
      await expect(storage.read({ key: "a", signal })).resolves.toStrictEqual(dataA);
      await expect(storage.read({ key: "b", signal })).resolves.toStrictEqual(dataB);
    } finally {
      storage.close();
    }
  });

  test("allowRepair: false では書き戻しの getWritable を拒否する", async ({
    bucket,
    endpoint,
    expect,
    signal,
  }) => {
    // 準備
    const storage = new S3(bucket, { ...createClientConfig(endpoint), allowRepair: false });
    await storage.open();

    try {
      // 実行と検証
      expect(() =>
        storage.getWritable({ key: "a", vars: { "unikvs:repair": true }, signal }),
      ).toThrow(RepairNotAllowedError);
      await expect(storage.exists({ key: "a", signal })).resolves.toBe(false);
    } finally {
      storage.close();
    }
  });

  test("書き戻しを許可した getWritable は通常どおり書き込める", async ({
    bucket,
    endpoint,
    expect,
    signal,
  }) => {
    // 準備
    const storage = new S3(bucket, { ...createClientConfig(endpoint), allowRepair: true });
    await storage.open();

    try {
      // 実行
      const writer = storage
        .getWritable({ key: "a", vars: { "unikvs:repair": true }, signal })
        .getWriter();
      await writer.write(new Uint8Array([1, 2, 3]));
      await writer.close();

      // 検証
      await expect(storage.exists({ key: "a", signal })).resolves.toBe(true);
    } finally {
      if (storage.isOpen) {
        storage.close();
      }
    }
  });
});
