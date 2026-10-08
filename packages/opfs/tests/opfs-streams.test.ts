import { describe } from "vitest";

import type Opfs from "../src/opfs.js";
import { concatBytes, readAll, test } from "./_helpers.js";

const { signal } = new AbortController();

/**
 * チャンク列を書き込み用ストリーム経由で保存し、閉じるまでをまとめて行います。
 * ストリーム書き込みのテストを簡潔に保つために使用します。
 */
async function writeChunks(
  storage: Opfs,
  key: string,
  chunks: readonly Uint8Array<ArrayBuffer>[],
): Promise<void> {
  const writable = await storage.getWritable({ key, signal, vars: {} });
  const writer = writable.getWriter();
  for (const chunk of chunks) {
    await writer.write(chunk);
  }

  await writer.close();
}

describe("書き込みストリームの振る舞い", () => {
  test("何も書き込まずに閉じたとき、空のデータが保存される", async ({ expect, storage }) => {
    // 準備
    const key = "empty-stream.bin";
    const writable = await storage.getWritable({ key, signal, vars: {} });

    // 実行
    await writable.close();
    const loaded = await storage.read({ key, signal });

    // 検証
    expect(await storage.exists({ key, signal })).toBe(true);
    expect(loaded).toStrictEqual(new Uint8Array());
  });

  test("1 チャンクだけ書き込んだとき、同じ内容が読み取れる", async ({ expect, storage }) => {
    // 準備
    const key = "single-chunk.bin";
    const data = new Uint8Array([1, 2, 3, 4, 5]);

    // 実行
    await writeChunks(storage, key, [data]);
    const loaded = await storage.read({ key, signal });

    // 検証
    expect(loaded).toStrictEqual(data);
  });

  test("複数チャンクを書き込んだとき、連結した内容が読み取れる", async ({ expect, storage }) => {
    // 準備
    const key = "multi-chunk.bin";
    const chunks = [new Uint8Array([1, 2]), new Uint8Array([3]), new Uint8Array([4, 5, 6])];

    // 実行
    await writeChunks(storage, key, chunks);
    const loaded = await storage.read({ key, signal });

    // 検証
    expect(loaded).toStrictEqual(concatBytes(chunks));
  });

  test("1 バイトずつ書き込んだとき、連結した内容が読み取れる", async ({ expect, storage }) => {
    // 準備
    const key = "byte-by-byte.bin";
    const chunks = Array.from({ length: 16 }, (_, index) => new Uint8Array([index]));

    // 実行
    await writeChunks(storage, key, chunks);
    const loaded = await storage.read({ key, signal });

    // 検証
    expect(loaded).toStrictEqual(concatBytes(chunks));
  });

  test("不揃いなチャンクサイズで書き込んだとき、連結した内容が読み取れる", async ({
    expect,
    storage,
  }) => {
    // 準備
    const key = "ragged-chunks.bin";
    const sizes = [1, 100, 2, 5000, 7];
    const chunks = sizes.map((size, index) => new Uint8Array(size).fill(index + 1));

    // 実行
    await writeChunks(storage, key, chunks);
    const loaded = await storage.read({ key, signal });

    // 検証
    expect(loaded).toStrictEqual(concatBytes(chunks));
  });

  test("MiB 級のデータを書き込んだとき、バイト単位で同じ内容が読み取れる", async ({
    expect,
    storage,
  }) => {
    // 準備
    const key = "mebibyte.bin";
    const data = Uint8Array.from({ length: 1024 * 1024 }, (_, index) => (index * 31) % 256);
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    for (let offset = 0; offset < data.length; offset += 100_000) {
      chunks.push(data.subarray(offset, offset + 100_000));
    }

    // 実行
    await writeChunks(storage, key, chunks);
    const streamed = await readAll(await storage.getReadable({ key, signal }));
    const loaded = await storage.read({ key, signal });

    // 検証
    expect(streamed).toStrictEqual(data);
    expect(loaded).toStrictEqual(data);
  });

  test("閉じる前は既存データが見え、閉じた後に新しいデータへ置き換わる", async ({
    expect,
    storage,
  }) => {
    // 準備
    const key = "visibility.bin";
    const original = new Uint8Array([1, 2, 3]);
    await storage.write({ key, data: original, signal, vars: {} });
    const writable = await storage.getWritable({ key, signal, vars: {} });
    const writer = writable.getWriter();
    await writer.write(new Uint8Array([9, 9]));

    // 実行
    const beforeClose = await storage.read({ key, signal });
    await writer.close();
    const afterClose = await storage.read({ key, signal });

    // 検証
    expect(beforeClose).toStrictEqual(original);
    expect(afterClose).toStrictEqual(new Uint8Array([9, 9]));
  });

  test("新規ファイルは閉じる前には空として見え、閉じた後に内容が入る", async ({
    expect,
    storage,
  }) => {
    // 準備
    const key = "new-file-visibility.bin";
    const writable = await storage.getWritable({ key, signal, vars: {} });
    const writer = writable.getWriter();
    await writer.write(new Uint8Array([1, 2, 3]));

    // 実行
    const existsBeforeClose = await storage.exists({ key, signal });
    const beforeClose = await storage.read({ key, signal });
    await writer.close();
    const afterClose = await storage.read({ key, signal });

    // 検証
    expect(existsBeforeClose).toBe(true);
    expect(beforeClose).toStrictEqual(new Uint8Array());
    expect(afterClose).toStrictEqual(new Uint8Array([1, 2, 3]));
  });

  test("書き込み途中で abort したとき、既存データが保持される", async ({ expect, storage }) => {
    // 準備
    const key = "aborted.bin";
    const original = new Uint8Array([1, 2, 3, 4, 5]);
    await storage.write({ key, data: original, signal, vars: {} });
    const writable = await storage.getWritable({ key, signal, vars: {} });
    const writer = writable.getWriter();
    await writer.write(new Uint8Array([9, 9, 9]));

    // 実行
    await writer.abort(new Error("テスト用の中断"));
    const loaded = await storage.read({ key, signal });

    // 検証
    expect(loaded).toStrictEqual(original);
  });

  test("新規ファイルの書き込みを abort したとき、空のファイルのままになる", async ({
    expect,
    storage,
  }) => {
    // 準備
    const key = "aborted-new.bin";
    const writable = await storage.getWritable({ key, signal, vars: {} });
    const writer = writable.getWriter();
    await writer.write(new Uint8Array([9, 9, 9]));

    // 実行
    await writer.abort(new Error("テスト用の中断"));
    const loaded = await storage.read({ key, signal });

    // 検証
    expect(await storage.exists({ key, signal })).toBe(true);
    expect(loaded).toStrictEqual(new Uint8Array());
  });
});

describe("読み取りストリームの振る舞い", () => {
  test("読み取りをキャンセルしたとき、以降の読み取りが完了状態になる", async ({
    expect,
    storage,
  }) => {
    // 準備
    const key = "cancelled.bin";
    const data = new Uint8Array(200_000).fill(7);
    await storage.write({ key, data, signal, vars: {} });
    const readable = await storage.getReadable({ key, signal });
    const reader = readable.getReader();
    await reader.read();

    // 実行
    await reader.cancel();
    const afterCancel = await reader.read();

    // 検証
    expect(afterCancel.done).toBe(true);

    const again = await readAll(await storage.getReadable({ key, signal }));
    expect(again).toStrictEqual(data);
  });

  test("存在しないキーのストリームを取得しようとしたとき、NotFoundError を投げる", async ({
    expect,
    storage,
  }) => {
    // 実行
    const error = await storage
      .getReadable({ key: "missing.bin", signal })
      .catch((ex: unknown) => ex);

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("NotFoundError");
  });

  test("ストリームで書き込んだデータを read で読み取ったとき、同じ内容になる", async ({
    expect,
    storage,
  }) => {
    // 準備
    const key = "stream-then-read.bin";
    const data = new Uint8Array([1, 2, 3, 4]);
    await writeChunks(storage, key, [data]);

    // 実行
    const loaded = await storage.read({ key, signal });

    // 検証
    expect(loaded).toStrictEqual(data);
  });

  test("write で書き込んだデータをストリームで読み取ったとき、同じ内容になる", async ({
    expect,
    storage,
  }) => {
    // 準備
    const key = "write-then-stream.bin";
    const data = new Uint8Array([5, 6, 7, 8]);
    await storage.write({ key, data, signal, vars: {} });

    // 実行
    const loaded = await readAll(await storage.getReadable({ key, signal }));

    // 検証
    expect(loaded).toStrictEqual(data);
  });

  test("空のファイルのストリームを取得したとき、最初の読み取りで完了する", async ({
    expect,
    storage,
  }) => {
    // 準備
    const key = "empty-file.bin";
    await storage.write({ key, data: new Uint8Array(), signal, vars: {} });

    // 実行
    const readable = await storage.getReadable({ key, signal });
    const first = await readable.getReader().read();

    // 検証
    expect(first.done).toBe(true);
  });

  test("同じファイルを複数のストリームで読み取ったとき、どちらも同じ内容になる", async ({
    expect,
    storage,
  }) => {
    // 準備
    const key = "multi-reader.bin";
    const data = new Uint8Array(150_000).fill(3);
    await storage.write({ key, data, signal, vars: {} });

    // 実行
    const [first, second] = await Promise.all([
      storage.getReadable({ key, signal }),
      storage.getReadable({ key, signal }),
    ]);
    const [firstData, secondData] = await Promise.all([readAll(first), readAll(second)]);

    // 検証
    expect(firstData).toStrictEqual(data);
    expect(secondData).toStrictEqual(data);
  });
});
