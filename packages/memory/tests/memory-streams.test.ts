import type { IStorage } from "@unikvs/core";
import {
  captureRejection,
  createGetContext,
  createHasContext,
  createSetContext,
  createDeleteContext,
  createStreamContext,
} from "@unikvs/testing";
import { test as vitest, describe } from "vite-plus/test";

import { KeyNotFoundError, InvalidChunkTypeError } from "../src/errors.js";
import Memory from "../src/memory.js";

/**
 * テストごとに空の Memory インスタンスを提供します。
 * ストリーム経由の読み書きの振る舞いを検証するために使用します。
 */
const test = vitest.extend<{ storage: Memory }>({
  async storage({}, use) {
    await use(new Memory());
  },
});
describe("getWritable", () => {
  test("長さの異なる複数のチャンクを順番どおり結合して保存する", async ({ expect, storage }) => {
    // 準備：
    const key = "s1";
    const writer = storage
      .getWritable(createSetContext(key) as IStorage.GetWritableContext)
      .getWriter();

    // 実行：
    await writer.write(new Uint8Array([1, 2, 3]));
    await writer.write(new Uint8Array([4]));
    await writer.write(new Uint8Array([5, 6]));
    await writer.close();

    // 検証：
    expect(storage.read(createGetContext(key) as IStorage.ReadContext)).toStrictEqual(
      new Uint8Array([1, 2, 3, 4, 5, 6]),
    );
  });

  test("書き込み後に元のチャンクを変更しても保存値は変わらない", async ({ expect, storage }) => {
    // 準備：
    const key = "s1";
    const chunk = new Uint8Array([1, 2, 3]);
    const writer = storage
      .getWritable(createSetContext(key) as IStorage.GetWritableContext)
      .getWriter();

    // 実行：
    await writer.write(chunk);
    chunk[0] = 99;
    await writer.close();

    // 検証：
    expect(storage.read(createGetContext(key) as IStorage.ReadContext)).toStrictEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  test("close するまで値は保存されない", async ({ expect, storage }) => {
    // 準備：
    const key = "s1";
    const writer = storage
      .getWritable(createSetContext(key) as IStorage.GetWritableContext)
      .getWriter();

    // 実行：
    await writer.write(new Uint8Array([1]));

    const existsBeforeClose = storage.exists(createHasContext(key) as IStorage.ExistsContext);

    await writer.close();

    // 検証：
    expect(existsBeforeClose).toBe(false);
    expect(storage.exists(createHasContext(key) as IStorage.ExistsContext)).toBe(true);
  });

  test("空のストリームを close したとき、長さ 0 の値が保存される", async ({ expect, storage }) => {
    // 準備：
    const key = "s1";
    const writer = storage
      .getWritable(createSetContext(key) as IStorage.GetWritableContext)
      .getWriter();

    // 実行：
    await writer.close();

    // 検証：
    expect(storage.exists(createHasContext(key) as IStorage.ExistsContext)).toBe(true);
    expect(storage.read(createGetContext(key) as IStorage.ReadContext)).toStrictEqual(
      new Uint8Array(0),
    );
  });

  test("abort したとき値は保存されない", async ({ expect, storage }) => {
    // 準備：
    const key = "s1";
    const writer = storage
      .getWritable(createSetContext(key) as IStorage.GetWritableContext)
      .getWriter();

    // 実行：
    await writer.write(new Uint8Array([1, 2]));
    await writer.abort();

    // 検証：
    expect(storage.exists(createHasContext(key) as IStorage.ExistsContext)).toBe(false);
    await expect(writer.closed).rejects.toBeUndefined();
  });

  test("Uint8Array 以外のチャンクを書き込むと InvalidChunkTypeError で拒否される", async ({
    expect,
    storage,
  }) => {
    // 準備：
    const key = "s1";
    const writer = storage
      .getWritable(createSetContext(key) as IStorage.GetWritableContext)
      .getWriter();

    // 実行：
    const error = await captureRejection(
      writer.write("invalid" as unknown as Uint8Array<ArrayBuffer>),
    );

    // 検証：
    expect(error).toBeInstanceOf(InvalidChunkTypeError);
    expect(storage.exists(createHasContext(key) as IStorage.ExistsContext)).toBe(false);
  });

  test("既存の値を上書きする", async ({ expect, storage }) => {
    // 準備：
    const key = "s1";
    storage.write(createSetContext(key) as IStorage.WriteContext, new Uint8Array([9]));

    const writer = storage
      .getWritable(createSetContext(key) as IStorage.GetWritableContext)
      .getWriter();

    // 実行：
    await writer.write(new Uint8Array([1, 2]));
    await writer.close();

    // 検証：
    expect(storage.read(createGetContext(key) as IStorage.ReadContext)).toStrictEqual(
      new Uint8Array([1, 2]),
    );
  });

  test("削除したキーへ再度ストリームで書き込める", async ({ expect, storage }) => {
    // 準備：
    const key = "s1";
    storage.write(createSetContext(key) as IStorage.WriteContext, new Uint8Array([9]));
    storage.delete(createDeleteContext(key) as IStorage.DeleteContext);

    const writer = storage
      .getWritable(createSetContext(key) as IStorage.GetWritableContext)
      .getWriter();

    // 実行：
    await writer.write(new Uint8Array([1]));
    await writer.close();

    // 検証：
    expect(storage.read(createGetContext(key) as IStorage.ReadContext)).toStrictEqual(
      new Uint8Array([1]),
    );
  });

  test("100 KB のチャンクを複数書き込んでも byte-for-byte で一致する", async ({
    expect,
    storage,
  }) => {
    // 準備：
    const key = "s1";
    const chunks = [
      new Uint8Array(100_000).fill(1),
      new Uint8Array(100_000).fill(2),
      new Uint8Array(100_000).fill(3),
    ];
    const expected = new Uint8Array(300_000);
    expected.fill(1, 0, 100_000);
    expected.fill(2, 100_000, 200_000);
    expected.fill(3, 200_000);

    // 実行：
    const writer = storage
      .getWritable(createSetContext(key) as IStorage.GetWritableContext)
      .getWriter();

    for (const chunk of chunks) {
      await writer.write(chunk);
    }

    await writer.close();

    // 検証：
    expect(storage.read(createGetContext(key) as IStorage.ReadContext)).toStrictEqual(expected);
  });
});
describe("getReadable", () => {
  test("存在しないキーでは KeyNotFoundError を投げる", ({ expect, storage }) => {
    // 実行と検証：
    expect(() =>
      storage.getReadable(createStreamContext("unknown") as IStorage.GetReadableContext),
    ).toThrow(KeyNotFoundError);
  });

  test("保存値を単一チャンクとして送出する", async ({ expect, storage }) => {
    // 準備：
    const key = "s1";
    const data = new Uint8Array([1, 2, 3]);
    storage.write(createSetContext(key) as IStorage.WriteContext, data);

    // 実行：
    const reader = storage
      .getReadable(createStreamContext(key) as IStorage.GetReadableContext)
      .getReader();
    const first = await reader.read();
    const second = await reader.read();

    // 検証：
    expect(first.done).toBe(false);
    expect(first.value).toStrictEqual(data);
    expect(second.done).toBe(true);
    expect(second.value).toBe(undefined);
  });

  test("同じキーから複数回読み取っても同じ値を得られる", async ({ expect, storage }) => {
    // 準備：
    const key = "s1";
    storage.write(createSetContext(key) as IStorage.WriteContext, new Uint8Array([1, 2]));

    const firstReader = storage
      .getReadable(createStreamContext(key) as IStorage.GetReadableContext)
      .getReader();
    const secondReader = storage
      .getReadable(createStreamContext(key) as IStorage.GetReadableContext)
      .getReader();

    // 実行：
    const first = await firstReader.read();
    const second = await secondReader.read();

    // 検証：
    expect(first.value).toStrictEqual(new Uint8Array([1, 2]));
    expect(second.value).toStrictEqual(new Uint8Array([1, 2]));
  });

  test("reader.cancel しても保存値は変わらない", async ({ expect, storage }) => {
    // 準備：
    const key = "s1";
    const data = new Uint8Array([1, 2, 3]);
    storage.write(createSetContext(key) as IStorage.WriteContext, data);

    const reader = storage
      .getReadable(createStreamContext(key) as IStorage.GetReadableContext)
      .getReader();

    // 実行：
    await reader.cancel();

    // 検証：
    expect(storage.read(createGetContext(key) as IStorage.ReadContext)).toStrictEqual(data);
  });

  test("読み取り中に同じキーを書き換えても進行中のストリームは元の値を送出する", async ({
    expect,
    storage,
  }) => {
    // 準備：
    const key = "s1";
    storage.write(createSetContext(key) as IStorage.WriteContext, new Uint8Array([1, 2]));

    const reader = storage
      .getReadable(createStreamContext(key) as IStorage.GetReadableContext)
      .getReader();

    // 実行：
    storage.write(createSetContext(key) as IStorage.WriteContext, new Uint8Array([3, 4]));
    const { value } = await reader.read();

    // 検証：
    expect(value).toStrictEqual(new Uint8Array([1, 2]));
  });

  test("ストリーム経由の読み取り結果は通常の read と byte-for-byte で一致する", async ({
    expect,
    storage,
  }) => {
    // 準備：
    const key = "s1";
    storage.write(createSetContext(key) as IStorage.WriteContext, new Uint8Array([0, 1, 2, 255]));

    const reader = storage
      .getReadable(createStreamContext(key) as IStorage.GetReadableContext)
      .getReader();

    // 実行：
    const { value } = await reader.read();

    // 検証：
    expect(value).toStrictEqual(storage.read(createGetContext(key) as IStorage.ReadContext));
  });
});
