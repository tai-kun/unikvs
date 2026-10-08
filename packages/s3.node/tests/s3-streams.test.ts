import { describe } from "vitest";

import { InvalidPartSizeError } from "../src/errors.js";
import { bytesEqual, collectBytes, createAllByteValues, test } from "./_helpers.js";

const PART_SIZE = 5 * 1024 * 1024;

describe("ストリーム操作", () => {
  test("チャンクを 1 つも書かずに閉じたストリームは 0 バイトのオブジェクトになる", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "empty-stream.bin";
    storage.open();

    // 実行
    const writer = storage.getWritable({ key, vars: {}, signal }).getWriter();
    await writer.close();

    // 検証
    await expect(storage.exists({ key, signal })).resolves.toBe(true);
    await expect(storage.read({ key, signal })).resolves.toStrictEqual(new Uint8Array(0));
  });

  test("空のチャンクを挟んでもデータが欠落しない", async ({ expect, signal, storage }) => {
    // 準備
    const key = "empty-chunks.bin";
    const expected = new TextEncoder().encode("part-1-part-2");
    storage.open();

    // 実行
    const writer = storage.getWritable({ key, vars: {}, signal }).getWriter();
    await writer.write(new Uint8Array(0));
    await writer.write(expected.subarray(0, 6));
    await writer.write(new Uint8Array(0));
    await writer.write(expected.subarray(6));
    await writer.close();

    // 検証
    await expect(storage.read({ key, signal })).resolves.toStrictEqual(expected);
  });

  test("1 チャンクだけのストリーム書き込みが通常の read と一致する", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "single-chunk.bin";
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    storage.open();

    // 実行
    const writer = storage.getWritable({ key, vars: {}, signal }).getWriter();
    await writer.write(data);
    await writer.close();

    // 検証
    await expect(storage.read({ key, signal })).resolves.toStrictEqual(data);
  });

  test("ストリーム書き込み・read・getReadable の結果が一致する", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "three-way.bin";
    const expected = createAllByteValues(256 * 32);
    storage.open();

    // 実行
    const writer = storage.getWritable({ key, vars: {}, signal }).getWriter();
    for (let offset = 0; offset < expected.length; offset += 1000) {
      await writer.write(expected.subarray(offset, offset + 1000));
    }
    await writer.close();
    const direct = await storage.read({ key, signal });
    const streamed = await collectBytes(await storage.getReadable({ key, signal }));

    // 検証
    expect(bytesEqual(direct, expected)).toBe(true);
    expect(bytesEqual(streamed, expected)).toBe(true);
  });

  test("partSize ちょうど 5 MiB のデータを保存できる", async ({ expect, signal, storage }) => {
    // 準備
    const key = "part-size-exact.bin";
    const data = createAllByteValues(PART_SIZE);
    storage.open();

    // 実行
    const writer = storage
      .getWritable({ key, vars: { "@unikvs/s3.node:partSize": PART_SIZE }, signal })
      .getWriter();
    await writer.write(data);
    await writer.close();
    const result = await storage.read({ key, signal });

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
    storage.open();

    // 実行
    const writer = storage
      .getWritable({ key, vars: { "@unikvs/s3.node:partSize": PART_SIZE }, signal })
      .getWriter();
    await writer.write(data);
    await writer.close();
    const result = await storage.read({ key, signal });

    // 検証
    expect(bytesEqual(result, data)).toBe(true);
  });

  test("@unikvs/s3:partSize がフォールバックとして使用される", ({ expect, signal, storage }) => {
    // 準備
    storage.open();

    // 実行と検証
    // 5 MiB 未満の値が実際に Upload に渡されたことをサーバー側のエラーで確認する。
    expect(() =>
      storage.getWritable({
        key: "fallback-part-size.bin",
        vars: { "@unikvs/s3:partSize": 1024 },
        signal,
      }),
    ).toThrow(/EntityTooSmall/);
  });

  test("@unikvs/s3.node:partSize は @unikvs/s3:partSize より優先される", ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    storage.open();

    // 実行と検証
    expect(() =>
      storage.getWritable({
        key: "precedence.bin",
        vars: {
          "@unikvs/s3.node:partSize": "不正な値",
          "@unikvs/s3:partSize": PART_SIZE,
        },
        signal,
      }),
    ).toThrow(InvalidPartSizeError);
  });

  test("writer.abort 後はオブジェクトが残らず、以後の操作も成功する", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "aborted-writer.bin";
    storage.open();
    const writer = storage.getWritable({ key, vars: {}, signal }).getWriter();
    // マルチパートアップロードが開始するサイズを書き込む。
    await writer.write(new Uint8Array(6 * 1024 * 1024));

    // 実行
    await writer.abort(new Error("中断"));

    // 検証
    await expect(storage.exists({ key, signal })).resolves.toBe(false);
    await expect(storage.read({ key, signal })).rejects.toThrow(/NoSuchKey|does not exist/);
    await storage.write({
      key: "after-writer-abort.bin",
      data: new Uint8Array([1]),
      signal,
      vars: {},
    });
    await expect(storage.exists({ key: "after-writer-abort.bin", signal })).resolves.toBe(true);
  });

  test("signal の中断で失敗したアップロードはオブジェクトを残さない", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "aborted-by-signal.bin";
    const controller = new AbortController();
    storage.open();
    const writer = storage.getWritable({ key, vars: {}, signal: controller.signal }).getWriter();
    await writer.write(new Uint8Array(6 * 1024 * 1024));

    // 実行
    controller.abort();

    // 検証
    await expect(writer.close()).rejects.toThrow(/abort/i);
    await expect(storage.exists({ key, signal })).resolves.toBe(false);
  });

  test("0 バイトのオブジェクトの getReadable は即座に完了する", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "empty-read.bin";
    storage.open();
    await storage.write({ key, data: new Uint8Array(0), signal, vars: {} });

    // 実行
    const streamed = await collectBytes(await storage.getReadable({ key, signal }));

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
    storage.open();
    await storage.write({ key, data: createAllByteValues(1024 * 1024), signal, vars: {} });
    const reader = (await storage.getReadable({ key, signal })).getReader();
    const first = await reader.read();

    // 実行
    await reader.cancel();

    // 検証
    expect(first.done).toBe(false);
    await storage.write({ key: "after-cancel.bin", data: new Uint8Array([2]), signal, vars: {} });
    await expect(storage.exists({ key: "after-cancel.bin", signal })).resolves.toBe(true);
  });

  test("存在しないキーの getReadable は NoSuchKey で拒否される", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    storage.open();

    // 実行と検証
    await expect(storage.getReadable({ key: "missing-stream.bin", signal })).rejects.toThrow(
      /NoSuchKey|does not exist/,
    );
  });

  test("中断済み signal で getReadable を呼ぶと拒否される", async ({ expect, storage }) => {
    // 準備
    const controller = new AbortController();
    controller.abort();
    storage.open();

    // 実行と検証
    await expect(
      storage.getReadable({ key: "aborted-read.bin", signal: controller.signal }),
    ).rejects.toThrow(/abort/i);
  });
});
