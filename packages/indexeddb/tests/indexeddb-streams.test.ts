import type { IStorage } from "@unikvs/core";
import {
  captureRejection,
  concatChunks,
  createGetContext,
  createHasContext,
  createOpenContext,
  createSetContext,
  createStreamContext,
} from "@unikvs/testing";
import { describe } from "vitest";

import { test } from "./_helpers.js";

const { signal } = new AbortController();

describe("getWritable", () => {
  test("チャンクを 1 つだけ書いたとき、その内容が保存される", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const writer = storage
      .getWritable(createSetContext("s1", { signal }) as IStorage.GetWritableContext)
      .getWriter();

    // 実行
    await writer.write(new Uint8Array([1, 2, 3]));
    await writer.close();

    // 検証
    expect(
      await storage.read(createGetContext("s1", { signal }) as IStorage.ReadContext),
    ).toStrictEqual(new Uint8Array([1, 2, 3]));
  });

  test("長さの異なる複数のチャンクを順番どおり結合して保存する", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const writer = storage
      .getWritable(createSetContext("s1", { signal }) as IStorage.GetWritableContext)
      .getWriter();

    // 実行
    await writer.write(new Uint8Array([1, 2, 3]));
    await writer.write(new Uint8Array([4]));
    await writer.write(new Uint8Array([5, 6]));
    await writer.write(new Uint8Array([7, 8, 9, 10]));
    await writer.close();

    // 検証
    expect(
      await storage.read(createGetContext("s1", { signal }) as IStorage.ReadContext),
    ).toStrictEqual(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
  });

  test("チャンクを 1 つも書かずに close したとき、長さ 0 の値が保存される", async ({
    expect,
    storage,
  }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const writer = storage
      .getWritable(createSetContext("s1", { signal }) as IStorage.GetWritableContext)
      .getWriter();

    // 実行
    await writer.close();

    // 検証
    expect(await storage.exists(createHasContext("s1", { signal }) as IStorage.ExistsContext)).toBe(
      true,
    );
    expect(
      await storage.read(createGetContext("s1", { signal }) as IStorage.ReadContext),
    ).toStrictEqual(new Uint8Array(0));
  });

  test("close するまで値は保存されない", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const writer = storage
      .getWritable(createSetContext("s1", { signal }) as IStorage.GetWritableContext)
      .getWriter();

    // 実行
    await writer.write(new Uint8Array([1]));
    const existsBeforeClose = await storage.exists(
      createHasContext("s1", { signal }) as IStorage.ExistsContext,
    );
    await writer.close();

    // 検証
    expect(existsBeforeClose).toBe(false);
    expect(await storage.exists(createHasContext("s1", { signal }) as IStorage.ExistsContext)).toBe(
      true,
    );
  });

  test("既存の値を上書きする", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.write(
      createSetContext("s1", { signal }) as IStorage.WriteContext,
      new Uint8Array([9]),
    );
    const writer = storage
      .getWritable(createSetContext("s1", { signal }) as IStorage.GetWritableContext)
      .getWriter();

    // 実行
    await writer.write(new Uint8Array([1, 2]));
    await writer.close();

    // 検証
    expect(
      await storage.read(createGetContext("s1", { signal }) as IStorage.ReadContext),
    ).toStrictEqual(new Uint8Array([1, 2]));
  });

  test("abort したとき値は保存されない", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const writer = storage
      .getWritable(createSetContext("s1", { signal }) as IStorage.GetWritableContext)
      .getWriter();

    // 実行
    await writer.write(new Uint8Array([1, 2]));
    await writer.abort();

    // 検証
    expect(await storage.exists(createHasContext("s1", { signal }) as IStorage.ExistsContext)).toBe(
      false,
    );
  });

  test("abort しても既存の値は残る", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.write(
      createSetContext("s1", { signal }) as IStorage.WriteContext,
      new Uint8Array([9]),
    );
    const writer = storage
      .getWritable(createSetContext("s1", { signal }) as IStorage.GetWritableContext)
      .getWriter();

    // 実行
    await writer.write(new Uint8Array([1, 2]));
    await writer.abort();

    // 検証
    expect(
      await storage.read(createGetContext("s1", { signal }) as IStorage.ReadContext),
    ).toStrictEqual(new Uint8Array([9]));
  });

  test("abort したとき writer.closed は undefined で拒否される", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const writer = storage
      .getWritable(createSetContext("s1", { signal }) as IStorage.GetWritableContext)
      .getWriter();

    // 実行
    await writer.write(new Uint8Array([1]));
    await writer.abort();

    // 検証
    await expect(writer.closed).rejects.toBeUndefined();
  });

  test("MiB 単位の複数チャンクを byte-for-byte で保存する", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const chunks = [
      new Uint8Array(512 * 1024).fill(1),
      new Uint8Array(1024 * 1024).fill(2),
      new Uint8Array(256 * 1024).fill(3),
    ];
    const writer = storage
      .getWritable(createSetContext("s1", { signal }) as IStorage.GetWritableContext)
      .getWriter();

    // 実行
    for (const chunk of chunks) {
      await writer.write(chunk);
    }
    await writer.close();

    // 検証
    expect(
      await storage.read(createGetContext("s1", { signal }) as IStorage.ReadContext),
    ).toStrictEqual(concatChunks(chunks));
  });

  test("Uint8Array 以外の文字列チャンクを書くと、長さぶんの 0 埋めとして保存される", async ({
    expect,
    storage,
  }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const writer = storage
      .getWritable(createSetContext("s1", { signal }) as IStorage.GetWritableContext)
      .getWriter();

    // 実行
    await writer.write("abc" as unknown as Uint8Array);
    await writer.close();

    // 検証
    expect(
      await storage.read(createGetContext("s1", { signal }) as IStorage.ReadContext),
    ).toStrictEqual(new Uint8Array([0, 0, 0]));
  });

  test("Uint8Array 以外の数値チャンクを書くと close が拒否される", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const writer = storage
      .getWritable(createSetContext("s1", { signal }) as IStorage.GetWritableContext)
      .getWriter();

    // 実行
    await writer.write(new Uint8Array([1]));
    const error = await captureRejection(
      writer.write(5 as unknown as Uint8Array).then(() => writer.close()),
    );

    // 検証
    expect(error).toBeInstanceOf(Error);
    expect(await storage.exists(createHasContext("s1", { signal }) as IStorage.ExistsContext)).toBe(
      false,
    );
  });
});

describe("getReadable", () => {
  test("保存値を単一チャンクとして送出し、その後クローズする", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const data = new Uint8Array([1, 2, 3]);
    await storage.write(createSetContext("s1", { signal }) as IStorage.WriteContext, data);
    const reader = storage
      .getReadable(createStreamContext("s1", { signal }) as IStorage.GetReadableContext)
      .getReader();

    // 実行
    const first = await reader.read();
    const second = await reader.read();

    // 検証
    expect(first.done).toBe(false);
    expect(first.value).toStrictEqual(data);
    expect(second.done).toBe(true);
    expect(second.value).toBe(undefined);
  });

  test("長さ 0 の値を送出できる", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.write(
      createSetContext("s1", { signal }) as IStorage.WriteContext,
      new Uint8Array(0),
    );
    const reader = storage
      .getReadable(createStreamContext("s1", { signal }) as IStorage.GetReadableContext)
      .getReader();

    // 実行
    const first = await reader.read();

    // 検証
    expect(first.done).toBe(false);
    expect(first.value).toStrictEqual(new Uint8Array(0));
  });

  test("同じキーから複数回読み取っても同じ値を得られる", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.write(
      createSetContext("s1", { signal }) as IStorage.WriteContext,
      new Uint8Array([1, 2]),
    );
    const firstReader = storage
      .getReadable(createStreamContext("s1", { signal }) as IStorage.GetReadableContext)
      .getReader();
    const secondReader = storage
      .getReadable(createStreamContext("s1", { signal }) as IStorage.GetReadableContext)
      .getReader();

    // 実行
    const first = await firstReader.read();
    const second = await secondReader.read();

    // 検証
    expect(first.value).toStrictEqual(new Uint8Array([1, 2]));
    expect(second.value).toStrictEqual(new Uint8Array([1, 2]));
  });

  test("reader.cancel しても保存値は変わらない", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const data = new Uint8Array([1, 2, 3]);
    await storage.write(createSetContext("s1", { signal }) as IStorage.WriteContext, data);
    const reader = storage
      .getReadable(createStreamContext("s1", { signal }) as IStorage.GetReadableContext)
      .getReader();

    // 実行
    await reader.cancel();

    // 検証
    expect(
      await storage.read(createGetContext("s1", { signal }) as IStorage.ReadContext),
    ).toStrictEqual(data);
  });

  test("reader.cancel の後でも通常の read はできる", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const data = new Uint8Array([4, 5, 6]);
    await storage.write(createSetContext("s1", { signal }) as IStorage.WriteContext, data);
    const reader = storage
      .getReadable(createStreamContext("s1", { signal }) as IStorage.GetReadableContext)
      .getReader();
    await reader.cancel();

    // 実行
    const result = await storage.read(createGetContext("s1", { signal }) as IStorage.ReadContext);

    // 検証
    expect(result).toStrictEqual(data);
  });

  test("送出されたチャンクを変更しても保存値は変わらない", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.write(
      createSetContext("s1", { signal }) as IStorage.WriteContext,
      new Uint8Array([1, 2, 3]),
    );
    const reader = storage
      .getReadable(createStreamContext("s1", { signal }) as IStorage.GetReadableContext)
      .getReader();

    // 実行
    const { value } = await reader.read();
    value![0] = 99;
    const second = await storage.read(createGetContext("s1", { signal }) as IStorage.ReadContext);

    // 検証
    expect(second).toStrictEqual(new Uint8Array([1, 2, 3]));
  });

  test("ストリーム経由の読み取り結果は通常の read と一致する", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await storage.write(
      createSetContext("s1", { signal }) as IStorage.WriteContext,
      new Uint8Array([0, 1, 2, 255]),
    );
    const reader = storage
      .getReadable(createStreamContext("s1", { signal }) as IStorage.GetReadableContext)
      .getReader();

    // 実行
    const { value } = await reader.read();

    // 検証
    expect(value).toStrictEqual(
      await storage.read(createGetContext("s1", { signal }) as IStorage.ReadContext),
    );
  });

  test("getWritable で書いた値を getReadable で読み取れる", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const writer = storage
      .getWritable(createSetContext("s1", { signal }) as IStorage.GetWritableContext)
      .getWriter();
    await writer.write(new Uint8Array([1, 2]));
    await writer.write(new Uint8Array([3]));
    await writer.close();

    // 実行
    const reader = storage
      .getReadable(createStreamContext("s1", { signal }) as IStorage.GetReadableContext)
      .getReader();
    const { value } = await reader.read();

    // 検証
    expect(value).toStrictEqual(new Uint8Array([1, 2, 3]));
  });
});
