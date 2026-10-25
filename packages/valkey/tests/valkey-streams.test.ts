import type { IStorage } from "@unikvs/core";
import {
  bytesEqual,
  concatBytes,
  createGetContext,
  createHasContext,
  createSetContext,
  createOpenContext,
  createCloseContext,
  createAllByteValues,
  createStreamContext,
} from "@unikvs/testing";
import { vi, describe } from "vite-plus/test";

import { test, createStorage } from "./_helpers.js";

describe("書き込みストリーム", () => {
  test("複数のチャンクを流し込んだとき、連結された内容が保存される", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備：
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

    // 実行：
    for (const chunk of chunks) {
      await writer.write(chunk);
    }

    await writer.close();

    // 検証：
    await expect(
      storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).resolves.toStrictEqual(expected);
  });

  test("全バイト値を含む複数の大きなチャンクを流し込んだとき、全データが正しく保存される", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備：
    const key = "stream-large.dat";
    const chunks = Array.from({ length: 10 }, (_, index) =>
      createAllByteValues(1024 * 1024 + index),
    );
    const expected = concatBytes(chunks);
    const writer = storage
      .getWritable(createSetContext(key, { signal }) as IStorage.GetWritableContext)
      .getWriter();

    // 実行：
    for (const chunk of chunks) {
      await writer.write(chunk);
    }

    await writer.close();

    // 検証：
    const result = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);
    expect(bytesEqual(result, expected)).toBe(true);
  });

  test("一度も書き込まずに close したとき、空のデータとして保存される", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備：
    const key = "stream-empty.dat";
    const writer = storage
      .getWritable(createSetContext(key, { signal }) as IStorage.GetWritableContext)
      .getWriter();

    // 実行：
    await writer.close();

    // 検証：
    await expect(
      storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext),
    ).resolves.toBe(true);
    await expect(
      storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).resolves.toStrictEqual(new Uint8Array(0));
  });

  test("close するまで既存のデータは置き換わらない", async ({ expect, signal, storage }) => {
    // 準備：
    const key = "stream-swap.dat";
    const original = new Uint8Array([1, 2, 3]);
    const replacement = new Uint8Array(4096).fill(7);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, original);

    const writer = storage
      .getWritable(createSetContext(key, { signal }) as IStorage.GetWritableContext)
      .getWriter();

    // 実行：
    await writer.write(replacement);

    // 検証：
    await expect(
      storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).resolves.toStrictEqual(original);

    // 実行：
    await writer.close();

    // 検証：
    const result = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);
    expect(bytesEqual(result, replacement)).toBe(true);
  });

  test("中断したとき、既存のデータを保ち一時キーが残らない", async ({
    fake,
    expect,
    signal,
    storage,
    keyPrefix,
  }) => {
    // 準備：
    const key = "stream-abort.dat";
    const original = new Uint8Array([1, 2, 3]);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, original);

    const controller = new AbortController();
    const writer = storage
      .getWritable(
        createSetContext(key, { signal: controller.signal }) as IStorage.GetWritableContext,
      )
      .getWriter();
    await writer.write(new Uint8Array([9, 9, 9]));

    // 実行：
    controller.abort();

    // 検証：
    await expect(writer.close()).rejects.toThrow();

    await expect(
      storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).resolves.toStrictEqual(original);
    // 中断時の後始末は待機されないため、完了まで待つ。
    await vi.waitFor(() => {
      expect(fake.keys(`${keyPrefix}*`)).toStrictEqual([`${keyPrefix}${key}`]);
    });
  });

  test("中断後に書き込もうとすると拒否される", async ({ fake, expect, storage, keyPrefix }) => {
    // 準備：
    const key = "stream-abort-write.dat";
    const controller = new AbortController();
    const writer = storage
      .getWritable(
        createSetContext(key, { signal: controller.signal }) as IStorage.GetWritableContext,
      )
      .getWriter();
    await writer.write(new Uint8Array([1]));

    // 実行：
    controller.abort();

    // 検証：
    await expect(writer.write(new Uint8Array([2]))).rejects.toThrow();

    await vi.waitFor(() => {
      expect(fake.keys(`${keyPrefix}*`)).toStrictEqual([]);
    });
  });

  test("writer.abort を呼び出したとき、一時キーが削除される", async ({
    fake,
    expect,
    signal,
    storage,
    keyPrefix,
  }) => {
    // 準備：
    const key = "stream-writer-abort.dat";
    const writer = storage
      .getWritable(createSetContext(key, { signal }) as IStorage.GetWritableContext)
      .getWriter();
    await writer.write(new Uint8Array([1, 2, 3]));

    // 実行：
    await writer.abort(new Error("中断"));

    // 検証：
    await expect(
      storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext),
    ).resolves.toBe(false);

    expect(fake.keys(`${keyPrefix}*`)).toStrictEqual([]);
  });

  test("開始に失敗したとき、既存のデータを保ち一時キーを残さない", async ({
    fake,
    expect,
    signal,
    storage,
    keyPrefix,
  }) => {
    // 準備：
    const key = "stream-set-failure.dat";
    const original = new Uint8Array([4, 5, 6]);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, original);

    vi.spyOn(fake, "set").mockRejectedValueOnce(new Error("set failure"));
    const writer = storage
      .getWritable(createSetContext(key, { signal }) as IStorage.GetWritableContext)
      .getWriter();

    // 実行と検証：
    await expect(writer.write(new Uint8Array([7, 8, 9]))).rejects.toThrow("set failure");

    await expect(
      storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).resolves.toStrictEqual(original);
    expect(fake.keys(`${keyPrefix}*`)).toStrictEqual([`${keyPrefix}${key}`]);
  });

  test("追記に失敗したとき、既存のデータを保ち一時キーを残さない", async ({
    fake,
    expect,
    signal,
    storage,
    keyPrefix,
  }) => {
    // 準備：
    const key = "stream-append-failure.dat";
    const original = new Uint8Array([4, 5, 6]);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, original);

    vi.spyOn(fake, "append").mockRejectedValueOnce(new Error("append failure"));
    const writer = storage
      .getWritable(createSetContext(key, { signal }) as IStorage.GetWritableContext)
      .getWriter();

    // 実行と検証：
    await expect(writer.write(new Uint8Array([7, 8, 9]))).rejects.toThrow("append failure");

    await expect(
      storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).resolves.toStrictEqual(original);
    expect(fake.keys(`${keyPrefix}*`)).toStrictEqual([`${keyPrefix}${key}`]);
  });

  test("close が失敗したとき、既存のデータを保ち一時キーを残さない", async ({
    fake,
    expect,
    signal,
    storage,
    keyPrefix,
  }) => {
    // 準備：
    const key = "stream-rename-failure.dat";
    const original = new Uint8Array([4, 5, 6]);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, original);

    const writer = storage
      .getWritable(createSetContext(key, { signal }) as IStorage.GetWritableContext)
      .getWriter();
    await writer.write(new Uint8Array([9, 9, 9]));

    vi.spyOn(fake, "rename").mockRejectedValueOnce(new Error("rename failure"));

    // 実行と検証：
    await expect(writer.close()).rejects.toThrow("rename failure");
    await expect(
      storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).resolves.toStrictEqual(original);
    expect(fake.keys(`${keyPrefix}*`)).toStrictEqual([`${keyPrefix}${key}`]);
  });

  test("同じキーへの並行ストリームは一時キーを共有しない", async ({
    fake,
    expect,
    signal,
    storage,
    keyPrefix,
  }) => {
    // 準備：
    const key = "stream-concurrent.dat";
    const first = storage
      .getWritable(createSetContext(key, { signal }) as IStorage.GetWritableContext)
      .getWriter();
    const second = storage
      .getWritable(createSetContext(key, { signal }) as IStorage.GetWritableContext)
      .getWriter();

    // 実行：
    await first.write(new Uint8Array([1, 1, 1]));
    await second.write(new Uint8Array([2, 2, 2]));
    await first.close();
    await second.close();

    // 検証：
    await expect(
      storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).resolves.toStrictEqual(new Uint8Array([2, 2, 2]));
    expect(fake.keys(`${keyPrefix}*`)).toStrictEqual([`${keyPrefix}${key}`]);
  });

  test("ttl を指定したとき、ストリーム確定後のキーに有効期限が付与される", async ({
    fake,
    expect,
    signal,
    keyPrefix,
  }) => {
    // 準備：
    const key = "stream-ttl.dat";
    const storage = createStorage(fake, keyPrefix, { ttl: 60_000 });
    await storage.open(createOpenContext() as IStorage.OpenContext);

    const writer = storage
      .getWritable(createSetContext(key, { signal }) as IStorage.GetWritableContext)
      .getWriter();

    try {
      // 実行：
      await writer.write(new Uint8Array([4, 5, 6]));
      await writer.close();

      // 検証：
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
    // 準備：
    const key = "stream-read.dat";
    const data = createAllByteValues(1024);
    await storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data);

    // 実行：
    const readable = storage.getReadable(
      createStreamContext(key, { signal }) as IStorage.GetReadableContext,
    );
    const reader = readable.getReader();
    const first = await reader.read();
    const second = await reader.read();

    // 検証：
    expect(first.done).toBe(false);

    // oxlint-disable-next-line vitest/no-conditional-in-test -- ポーリング／後始末の条件分岐はテストの進行に必須のため、使用します。
    if (!first.done) {
      expect(bytesEqual(first.value, data)).toBe(true);
    }

    expect(second.done).toBe(true);
  });

  test("中断後に読み取ろうとすると拒否される", async ({ expect, signal, storage }) => {
    // 準備：
    const key = "stream-abort-read.dat";
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    const controller = new AbortController();
    const reader = storage
      .getReadable(
        createStreamContext(key, { signal: controller.signal }) as IStorage.GetReadableContext,
      )
      .getReader();

    // 実行：
    controller.abort();

    // 検証：
    await expect(reader.read()).rejects.toThrow();
  });
});
