import type { IStorage } from "@unikvs/core";
import {
  abortedSignal,
  captureRejection,
  createGetContext,
  createHasContext,
  createOpenContext,
  createSetContext,
  createStreamContext,
} from "@unikvs/testing";
import { describe } from "vitest";

import CacheStorage from "../src/cache-storage.js";
import { InvalidChunkTypeError, KeyNotFoundError } from "../src/errors.js";
import {
  createFakeCaches,
  createRequest,
  readBody,
  readBytes,
  test,
  writeBytes,
} from "./_helpers.js";

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
    const response = await storage.read(createGetContext("s1", { signal }) as IStorage.ReadContext);
    expect(response.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(await readBody(response)).toStrictEqual(new Uint8Array([1, 2, 3]));
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
    expect(await readBytes(storage, "s1")).toStrictEqual(
      new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
    );
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
    expect(await readBytes(storage, "s1")).toStrictEqual(new Uint8Array(0));
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
    await writeBytes(storage, "s1", new Uint8Array([9]));
    const writer = storage
      .getWritable(createSetContext("s1", { signal }) as IStorage.GetWritableContext)
      .getWriter();

    // 実行
    await writer.write(new Uint8Array([1, 2]));
    await writer.close();

    // 検証
    expect(await readBytes(storage, "s1")).toStrictEqual(new Uint8Array([1, 2]));
  });

  test("書き込み後にチャンクを変更しても保存値は変わらない", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const chunk = new Uint8Array([1, 2, 3]);
    const writer = storage
      .getWritable(createSetContext("s1", { signal }) as IStorage.GetWritableContext)
      .getWriter();

    // 実行
    await writer.write(chunk);
    chunk[0] = 99;
    await writer.close();

    // 検証
    expect(await readBytes(storage, "s1")).toStrictEqual(new Uint8Array([1, 2, 3]));
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
    await writeBytes(storage, "s1", new Uint8Array([9]));
    const writer = storage
      .getWritable(createSetContext("s1", { signal }) as IStorage.GetWritableContext)
      .getWriter();

    // 実行
    await writer.write(new Uint8Array([1, 2]));
    await writer.abort();

    // 検証
    expect(await readBytes(storage, "s1")).toStrictEqual(new Uint8Array([9]));
  });

  test("Uint8Array 以外のチャンクを書いたとき、InvalidChunkTypeError で拒否される", async ({
    expect,
    storage,
  }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const writer = storage
      .getWritable(createSetContext("s1", { signal }) as IStorage.GetWritableContext)
      .getWriter();

    // 実行
    const error = await captureRejection(writer.write("abc" as unknown as Uint8Array<ArrayBuffer>));

    // 検証
    expect(error).toBeInstanceOf(InvalidChunkTypeError);
    expect(await storage.exists(createHasContext("s1", { signal }) as IStorage.ExistsContext)).toBe(
      false,
    );
  });

  test("中断済みの signal でチャンクを書いたとき、中断理由で拒否される", async ({
    expect,
    storage,
  }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const reason = new Error("独自の中断理由");
    const aborted = abortedSignal(reason);
    const writer = storage
      .getWritable(createSetContext("s1", { signal: aborted }) as IStorage.GetWritableContext)
      .getWriter();

    // 実行と検証
    await expect(writer.write(new Uint8Array([1]))).rejects.toBe(reason);
  });
});

describe("getReadable", () => {
  test("保存値を単一チャンクとして送出し、その後クローズする", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const data = new Uint8Array([1, 2, 3]);
    await writeBytes(storage, "s1", data);
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
    await writeBytes(storage, "s1", new Uint8Array(0));
    const reader = storage
      .getReadable(createStreamContext("s1", { signal }) as IStorage.GetReadableContext)
      .getReader();

    // 実行
    const first = await reader.read();

    // 検証
    expect(first.done).toBe(false);
    expect(first.value).toStrictEqual(new Uint8Array(0));
  });

  test("存在しないキーを読み取ろうとしたとき、ストリームは KeyNotFoundError で終了する", async ({
    expect,
    storage,
  }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const reader = storage
      .getReadable(createStreamContext("missing", { signal }) as IStorage.GetReadableContext)
      .getReader();

    // 実行と検証
    await expect(reader.read()).rejects.toThrow(KeyNotFoundError);
  });

  test("reader.cancel しても保存値は変わらない", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const data = new Uint8Array([1, 2, 3]);
    await writeBytes(storage, "s1", data);
    const reader = storage
      .getReadable(createStreamContext("s1", { signal }) as IStorage.GetReadableContext)
      .getReader();

    // 実行
    await reader.cancel();

    // 検証
    expect(await readBytes(storage, "s1")).toStrictEqual(data);
  });

  test("送出されたチャンクを変更しても保存値は変わらない", async ({ expect, storage }) => {
    // 準備
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    await writeBytes(storage, "s1", new Uint8Array([1, 2, 3]));
    const reader = storage
      .getReadable(createStreamContext("s1", { signal }) as IStorage.GetReadableContext)
      .getReader();

    // 実行
    const { value } = await reader.read();
    value![0] = 99;

    // 検証
    expect(await readBytes(storage, "s1")).toStrictEqual(new Uint8Array([1, 2, 3]));
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

  test("読み取りの待機中に中断したとき、中断理由で拒否される", async ({ cacheName, expect }) => {
    // 準備
    const storage = new CacheStorage({
      cacheName,
      caches: createFakeCaches({ pending: "match" }),
      toRequest: createRequest,
    });
    await storage.open(createOpenContext({ signal }) as IStorage.OpenContext);
    const reason = new Error("独自の中断理由");
    const aborted = abortedSignal(reason);
    const reader = storage
      .getReadable(createStreamContext("s1", { signal: aborted }) as IStorage.GetReadableContext)
      .getReader();

    // 実行と検証
    await expect(reader.read()).rejects.toBe(reason);
  });
});
