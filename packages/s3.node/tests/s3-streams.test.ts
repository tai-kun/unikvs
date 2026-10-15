import type { IStorage } from "@unikvs/core";
import {
  bytesEqual,
  collectBytes,
  createAllByteValues,
  createGetContext,
  createHasContext,
  createOpenContext,
  createSetContext,
  createStreamContext,
} from "@unikvs/testing";
import { describe } from "vitest";

import { InvalidPartSizeError } from "../src/errors.js";
import { test } from "./_helpers.js";

const PART_SIZE = 5 * 1024 * 1024;

describe("ストリーム操作", () => {
  test("チャンクを 1 つも書かずに閉じたストリームは 0 バイトのオブジェクトになる", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "empty-stream.bin";
    storage.open(createOpenContext() as IStorage.OpenContext);

    // 実行
    const writer = storage
      .getWritable(createSetContext(key, { signal }) as IStorage.GetWritableContext)
      .getWriter();
    await writer.close();

    // 検証
    await expect(
      storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext),
    ).resolves.toBe(true);
    await expect(
      storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).resolves.toStrictEqual(new Uint8Array(0));
  });

  test("空のチャンクを挟んでもデータが欠落しない", async ({ expect, signal, storage }) => {
    // 準備
    const key = "empty-chunks.bin";
    const expected = new TextEncoder().encode("part-1-part-2");
    storage.open(createOpenContext() as IStorage.OpenContext);

    // 実行
    const writer = storage
      .getWritable(createSetContext(key, { signal }) as IStorage.GetWritableContext)
      .getWriter();
    await writer.write(new Uint8Array(0));
    await writer.write(expected.subarray(0, 6));
    await writer.write(new Uint8Array(0));
    await writer.write(expected.subarray(6));
    await writer.close();

    // 検証
    await expect(
      storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).resolves.toStrictEqual(expected);
  });

  test("1 チャンクだけのストリーム書き込みが通常の read と一致する", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "single-chunk.bin";
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    storage.open(createOpenContext() as IStorage.OpenContext);

    // 実行
    const writer = storage
      .getWritable(createSetContext(key, { signal }) as IStorage.GetWritableContext)
      .getWriter();
    await writer.write(data);
    await writer.close();

    // 検証
    await expect(
      storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).resolves.toStrictEqual(data);
  });

  test("ストリーム書き込み・read・getReadable の結果が一致する", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "three-way.bin";
    const expected = createAllByteValues(256 * 32);
    storage.open(createOpenContext() as IStorage.OpenContext);

    // 実行
    const writer = storage
      .getWritable(createSetContext(key, { signal }) as IStorage.GetWritableContext)
      .getWriter();
    for (let offset = 0; offset < expected.length; offset += 1000) {
      await writer.write(expected.subarray(offset, offset + 1000));
    }
    await writer.close();
    const direct = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);
    const streamed = await collectBytes(
      await storage.getReadable(
        createStreamContext(key, { signal }) as IStorage.GetReadableContext,
      ),
    );

    // 検証
    expect(bytesEqual(direct, expected)).toBe(true);
    expect(bytesEqual(streamed, expected)).toBe(true);
  });

  test("partSize ちょうど 5 MiB のデータを保存できる", async ({ expect, signal, storage }) => {
    // 準備
    const key = "part-size-exact.bin";
    const data = createAllByteValues(PART_SIZE);
    storage.open(createOpenContext() as IStorage.OpenContext);

    // 実行
    const writer = storage
      .getWritable(
        createSetContext(key, {
          signal,
          values: { "@unikvs/s3.node:partSize": PART_SIZE },
        }) as IStorage.GetWritableContext,
      )
      .getWriter();
    await writer.write(data);
    await writer.close();
    const result = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);

    // 検証
    expect(bytesEqual(result, data)).toBe(true);
  });

  test("partSize を 1 バイト超えるデータを複数パートで保存できる", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "part-size-over.bin";
    const data = createAllByteValues(PART_SIZE + 1);
    storage.open(createOpenContext() as IStorage.OpenContext);

    // 実行
    const writer = storage
      .getWritable(
        createSetContext(key, {
          signal,
          values: { "@unikvs/s3.node:partSize": PART_SIZE },
        }) as IStorage.GetWritableContext,
      )
      .getWriter();
    await writer.write(data);
    await writer.close();
    const result = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);

    // 検証
    expect(bytesEqual(result, data)).toBe(true);
  });

  test("@unikvs/s3:partSize がフォールバックとして使用される", ({ expect, signal, storage }) => {
    // 準備
    storage.open(createOpenContext() as IStorage.OpenContext);

    // 実行と検証
    // 5 MiB 未満の値が実際に Upload に渡されたことをサーバー側のエラーで確認する。
    expect(() =>
      storage.getWritable(
        createSetContext("fallback-part-size.bin", {
          signal,
          values: { "@unikvs/s3:partSize": 1024 },
        }) as IStorage.GetWritableContext,
      ),
    ).toThrow(/EntityTooSmall/);
  });

  test("@unikvs/s3.node:partSize は @unikvs/s3:partSize より優先される", ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    storage.open(createOpenContext() as IStorage.OpenContext);

    // 実行と検証
    expect(() =>
      storage.getWritable(
        createSetContext("precedence.bin", {
          signal,
          values: {
            "@unikvs/s3.node:partSize": "不正な値",
            "@unikvs/s3:partSize": PART_SIZE,
          },
        }) as IStorage.GetWritableContext,
      ),
    ).toThrow(InvalidPartSizeError);
  });

  test("writer.abort 後はオブジェクトが残らず、以後の操作も成功する", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "aborted-writer.bin";
    storage.open(createOpenContext() as IStorage.OpenContext);
    const writer = storage
      .getWritable(createSetContext(key, { signal }) as IStorage.GetWritableContext)
      .getWriter();
    // マルチパートアップロードが開始するサイズを書き込む。
    await writer.write(new Uint8Array(6 * 1024 * 1024));

    // 実行
    await writer.abort(new Error("中断"));

    // 検証
    await expect(
      storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext),
    ).resolves.toBe(false);
    await expect(
      storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
    ).rejects.toThrow(/NoSuchKey|does not exist/);
    await storage.write(
      createSetContext("after-writer-abort.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );
    await expect(
      storage.exists(
        createHasContext("after-writer-abort.bin", { signal }) as IStorage.ExistsContext,
      ),
    ).resolves.toBe(true);
  });

  test("signal の中断で失敗したアップロードはオブジェクトを残さない", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "aborted-by-signal.bin";
    const controller = new AbortController();
    storage.open(createOpenContext() as IStorage.OpenContext);
    const writer = storage
      .getWritable(
        createSetContext(key, { signal: controller.signal }) as IStorage.GetWritableContext,
      )
      .getWriter();
    await writer.write(new Uint8Array(6 * 1024 * 1024));

    // 実行
    controller.abort();

    // 検証
    await expect(writer.close()).rejects.toThrow(/abort/i);
    await expect(
      storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext),
    ).resolves.toBe(false);
  });

  test("0 バイトのオブジェクトの getReadable は即座に完了する", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "empty-read.bin";
    storage.open(createOpenContext() as IStorage.OpenContext);
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array(0),
    );

    // 実行
    const streamed = await collectBytes(
      await storage.getReadable(
        createStreamContext(key, { signal }) as IStorage.GetReadableContext,
      ),
    );

    // 検証
    expect(streamed).toStrictEqual(new Uint8Array(0));
  });

  test("reader.cancel で読み取りを中断しても後続の操作が成功する", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "cancelled-reader.bin";
    storage.open(createOpenContext() as IStorage.OpenContext);
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      createAllByteValues(1024 * 1024),
    );
    const reader = (
      await storage.getReadable(createStreamContext(key, { signal }) as IStorage.GetReadableContext)
    ).getReader();
    const first = await reader.read();

    // 実行
    await reader.cancel();

    // 検証
    expect(first.done).toBe(false);
    await storage.write(
      createSetContext("after-cancel.bin", { signal }) as IStorage.WriteContext,
      new Uint8Array([2]),
    );
    await expect(
      storage.exists(createHasContext("after-cancel.bin", { signal }) as IStorage.ExistsContext),
    ).resolves.toBe(true);
  });

  test("存在しないキーの getReadable は NoSuchKey で拒否される", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    storage.open(createOpenContext() as IStorage.OpenContext);

    // 実行と検証
    await expect(
      storage.getReadable(
        createStreamContext("missing-stream.bin", { signal }) as IStorage.GetReadableContext,
      ),
    ).rejects.toThrow(/NoSuchKey|does not exist/);
  });

  test("中断済み signal で getReadable を呼ぶと拒否される", async ({ expect, storage }) => {
    // 準備
    const controller = new AbortController();
    controller.abort();
    storage.open(createOpenContext() as IStorage.OpenContext);

    // 実行と検証
    await expect(
      storage.getReadable(
        createStreamContext("aborted-read.bin", {
          signal: controller.signal,
        }) as IStorage.GetReadableContext,
      ),
    ).rejects.toThrow(/abort/i);
  });
});
