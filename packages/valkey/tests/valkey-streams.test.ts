import type { IStorage } from "@unikvs/core";
import {
  bytesEqual,
  concatBytes,
  createAllByteValues,
  createCloseContext,
  createGetContext,
  createHasContext,
  createOpenContext,
  createSetContext,
  createStreamContext,
} from "@unikvs/testing";
import { describe } from "vitest";

import { KeyNotFoundError } from "../src/errors.js";
import { createStorage, test } from "./_helpers.js";

describe("書き込みストリーム", () => {
  test("複数のチャンクを流し込んだとき、連結された内容が保存される", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "stream-chunks.dat";
    const chunks = [
      new Uint8Array([10, 20, 30]),
      new TextEncoder().encode("middle chunk"),
      new Uint8Array([200, 201]),
    ];
    const expected = new Uint8Array(chunks.flatMap((chunk) => Array.from(chunk)));
    const writer = storage
      .getWritable(createSetContext(key, { signal }) as IStorage.GetWritableContext)
      .getWriter();

    // 実行
    for (const chunk of chunks) {
      await writer.write(chunk);
    }
    await writer.close();

    // 検証
    await expect(
      storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).resolves.toStrictEqual(expected);
  });

  test("全バイト値を含む複数の大きなチャンクを流し込んだとき、全データが正しく保存される", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "stream-large.dat";
    const chunks = Array.from({ length: 10 }, (_, index) =>
      createAllByteValues(1024 * 1024 + index),
    );
    const expected = concatBytes(chunks);
    const writer = storage
      .getWritable(createSetContext(key, { signal }) as IStorage.GetWritableContext)
      .getWriter();

    // 実行
    for (const chunk of chunks) {
      await writer.write(chunk);
    }
    await writer.close();

    // 検証
    const result = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);
    expect(bytesEqual(result, expected)).toBe(true);
  });

  test("一度も書き込まずに close したとき、空のデータとして保存される", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "stream-empty.dat";
    const writer = storage
      .getWritable(createSetContext(key, { signal }) as IStorage.GetWritableContext)
      .getWriter();

    // 実行
    await writer.close();

    // 検証
    await expect(
      storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext),
    ).resolves.toBe(true);
    await expect(
      storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).resolves.toStrictEqual(new Uint8Array(0));
  });

  test("close するまで既存のデータは置き換わらない", async ({ expect, signal, storage }) => {
    // 準備
    const key = "stream-swap.dat";
    const original = new Uint8Array([1, 2, 3]);
    const replacement = new Uint8Array(4096).fill(7);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, original);
    const writer = storage
      .getWritable(createSetContext(key, { signal }) as IStorage.GetWritableContext)
      .getWriter();

    // 実行
    await writer.write(replacement);

    // 検証
    await expect(
      storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).resolves.toStrictEqual(original);

    // 実行
    await writer.close();

    // 検証
    const result = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);
    expect(bytesEqual(result, replacement)).toBe(true);
  });

  test("中断したとき、一時キーが残らない", async ({ expect, fake, keyPrefix, storage }) => {
    // 準備
    const key = "stream-abort.dat";
    const controller = new AbortController();
    const writer = storage
      .getWritable(
        createSetContext(key, { signal: controller.signal }) as IStorage.GetWritableContext,
      )
      .getWriter();
    await writer.write(new Uint8Array([1, 2, 3]));

    // 実行
    controller.abort();
    await writer.abort().catch(() => {});

    // 検証
    expect(fake.keys(`${keyPrefix}*`)).toStrictEqual([]);
  });

  test("ttl を指定したとき、ストリーム確定後のキーに有効期限が付与される", async ({
    expect,
    fake,
    keyPrefix,
    signal,
  }) => {
    // 準備
    const key = "stream-ttl.dat";
    const storage = createStorage(fake, keyPrefix, { ttl: 60_000 });
    await storage.open(createOpenContext() as IStorage.OpenContext);
    const writer = storage
      .getWritable(createSetContext(key, { signal }) as IStorage.GetWritableContext)
      .getWriter();

    try {
      // 実行
      await writer.write(new Uint8Array([4, 5, 6]));
      await writer.close();

      // 検証
      const remaining = fake.pttl(`${keyPrefix}${key}`);
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(60_000);
    } finally {
      await storage.close(createCloseContext() as IStorage.CloseContext);
    }
  });
});

describe("読み取りストリーム", () => {
  test("保存した内容が単一チャンクで読み取れる", async ({ expect, signal, storage }) => {
    // 準備
    const key = "stream-read.dat";
    const data = createAllByteValues(1024);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

    // 実行
    const readable = storage.getReadable(
      createStreamContext(key, { signal }) as IStorage.GetReadableContext,
    );
    const reader = readable.getReader();
    const first = await reader.read();
    const second = await reader.read();

    // 検証
    expect(first.done).toBe(false);
    if (!first.done) {
      expect(bytesEqual(first.value, data)).toBe(true);
    }
    expect(second.done).toBe(true);
  });

  test("存在しないキーのとき、pull が KeyNotFoundError で失敗する", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const readable = storage.getReadable(
      createStreamContext("missing-stream.dat", { signal }) as IStorage.GetReadableContext,
    );

    // 実行と検証
    const reader = readable.getReader();
    await expect(reader.read()).rejects.toThrow(KeyNotFoundError);
  });
});
