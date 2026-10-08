import { stat } from "node:fs/promises";
import { join } from "node:path";

import { describe } from "vitest";

import {
  bytesEqual,
  collectBytes,
  concatBytes,
  createPseudoRandomBytes,
  listTemporaryFiles,
  test,
} from "./_helpers.js";

describe("getWritable の詳細", () => {
  test("サイズの異なる複数チャンクを書き込んだとき、byte-for-byte で一致する", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "chunks.bin";
    const chunks = [
      new Uint8Array([1]),
      new Uint8Array([2, 2]),
      new Uint8Array([3, 3, 3]),
      new Uint8Array(1000).fill(4),
      new Uint8Array(65536).fill(5),
    ];
    const expected = concatBytes(chunks);
    const writer = (await storage.getWritable({ key, signal, vars: {} })).getWriter();

    // 実行
    for (const chunk of chunks) {
      await writer.write(chunk);
    }
    await writer.close();

    // 検証
    expect(bytesEqual(new Uint8Array(await storage.read({ key, signal })), expected)).toBe(true);
  });

  test("空のストリームを close したとき、0 バイトのファイルが作成される", async ({
    expect,
    root,
    signal,
    storage,
  }) => {
    // 準備
    const key = "empty.bin";
    const writer = (await storage.getWritable({ key, signal, vars: {} })).getWriter();

    // 実行
    await writer.close();

    // 検証
    expect(await storage.exists({ key })).toBe(true);
    expect((await stat(join(root, key))).size).toBe(0);
    expect(await storage.read({ key, signal })).toHaveLength(0);
  });

  test("close するまで最終ファイルは見えず、close で rename される", async ({
    expect,
    root,
    signal,
    storage,
  }) => {
    // 準備
    const key = "swap.bin";
    const writer = (await storage.getWritable({ key, signal, vars: {} })).getWriter();
    await writer.write(new Uint8Array([1, 2, 3]));

    // 検証 (close 前)
    expect(await storage.exists({ key })).toBe(false);
    const tmpBeforeClose = await listTemporaryFiles(root);
    expect(tmpBeforeClose).toHaveLength(1);
    expect(tmpBeforeClose[0]).toMatch(/^swap\.bin\.[0-9a-f-]+\.tmp$/);

    // 実行
    await writer.close();

    // 検証 (close 後)
    expect(await storage.exists({ key })).toBe(true);
    expect(await listTemporaryFiles(root)).toStrictEqual([]);
  });

  test("既存キーへのストリーム書き込みは close するまで古いデータのままである", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "overwrite-stream.bin";
    const oldData = new Uint8Array([1, 1, 1]);
    const newData = new Uint8Array([2, 2, 2, 2]);
    await storage.write({ key, data: oldData, signal, vars: {} });
    const writer = (await storage.getWritable({ key, signal, vars: {} })).getWriter();

    // 実行
    await writer.write(newData);

    // 検証 (close 前)
    expect(new Uint8Array(await storage.read({ key, signal }))).toStrictEqual(oldData);

    // 実行
    await writer.close();

    // 検証 (close 後)
    expect(new Uint8Array(await storage.read({ key, signal }))).toStrictEqual(newData);
  });

  test("8 MiB のデータを 1 MiB チャンクで書き込んでも欠落しない", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "large.bin";
    const data = createPseudoRandomBytes(8 * 1024 * 1024);
    const chunkSize = 1024 * 1024;
    const writer = (await storage.getWritable({ key, signal, vars: {} })).getWriter();

    // 実行
    for (let offset = 0; offset < data.length; offset += chunkSize) {
      await writer.write(data.subarray(offset, offset + chunkSize));
    }
    await writer.close();

    // 検証
    expect(bytesEqual(new Uint8Array(await storage.read({ key, signal })), data)).toBe(true);
  });

  test("writer.abort したとき、既存データが保たれ一時ファイルも残らない", async ({
    expect,
    root,
    signal,
    storage,
  }) => {
    // 準備
    const key = "abort-existing.bin";
    const original = new Uint8Array([5, 5, 5]);
    await storage.write({ key, data: original, signal, vars: {} });
    const writer = (await storage.getWritable({ key, signal, vars: {} })).getWriter();
    await writer.write(new Uint8Array(1024 * 1024).fill(0x42));

    // 実行
    const reason = new Error("中断理由");
    await writer.abort(reason);

    // 検証
    await expect(writer.closed).rejects.toBe(reason);
    expect(new Uint8Array(await storage.read({ key, signal }))).toStrictEqual(original);
    expect(await listTemporaryFiles(root)).toStrictEqual([]);
  });

  test("writer.abort した新規キーはファイルも一時ファイルも残さない", async ({
    expect,
    root,
    signal,
    storage,
  }) => {
    // 準備
    const key = "abort-new.bin";
    const writer = (await storage.getWritable({ key, signal, vars: {} })).getWriter();
    await writer.write(new Uint8Array(1024).fill(1));

    // 実行
    await writer.abort();

    // 検証
    expect(await storage.exists({ key })).toBe(false);
    expect(await listTemporaryFiles(root)).toStrictEqual([]);
  });

  test("abort 済みの signal を渡したとき、getWritable は失敗しファイルも一時ファイルも作られない", async ({
    expect,
    root,
    storage,
  }) => {
    // 準備
    const key = "aborted-signal.bin";
    const controller = new AbortController();
    controller.abort();

    // 実行と検証
    await expect(
      storage.getWritable({ key, signal: controller.signal, vars: {} }),
    ).rejects.toThrow();
    expect(await storage.exists({ key })).toBe(false);
    expect(await listTemporaryFiles(root)).toStrictEqual([]);
  });
});

describe("getReadable の詳細", () => {
  test("存在しないキーの getReadable は読み取り時に ENOENT で失敗する", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const reader = storage.getReadable({ key: "missing.bin", signal }).getReader();

    // 実行と検証
    await expect(reader.read()).rejects.toThrow(/ENOENT/);
  });

  test("0 バイトファイルの getReadable はチャンクを返さず終了する", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "empty-stream.bin";
    await storage.write({ key, data: new Uint8Array(0), signal, vars: {} });

    // 実行
    const result = await collectBytes(storage.getReadable({ key, signal }));

    // 検証
    expect(result).toHaveLength(0);
  });

  test("reader.cancel した後も保存データは変わらない", async ({ expect, signal, storage }) => {
    // 準備
    const key = "cancel.bin";
    const data = createPseudoRandomBytes(256 * 1024);
    await storage.write({ key, data, signal, vars: {} });
    const reader = storage.getReadable({ key, signal }).getReader();
    await reader.read();

    // 実行
    await reader.cancel();

    // 検証
    expect(bytesEqual(new Uint8Array(await storage.read({ key, signal })), data)).toBe(true);
  });

  test("ストリーム経由の読み取り結果は通常の read と byte-for-byte で一致する", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "consistent.bin";
    const data = createPseudoRandomBytes(2 * 1024 * 1024);
    await storage.write({ key, data, signal, vars: {} });

    // 実行
    const streamed = await collectBytes(storage.getReadable({ key, signal }));
    const direct = await storage.read({ key, signal });

    // 検証
    expect(bytesEqual(streamed, direct)).toBe(true);
    expect(bytesEqual(streamed, data)).toBe(true);
  });

  test("中断済みの signal を渡したとき、getReadable は同期エラーになる", ({ expect, storage }) => {
    // 準備
    const controller = new AbortController();
    controller.abort();

    // 実行と検証
    expect(() =>
      storage.getReadable({ key: "aborted-read.bin", signal: controller.signal }),
    ).toThrow();
  });

  test("読み取り中に signal を中断したとき、読み取りが中断理由で失敗する", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "aborted-middle-read.bin";
    const data = createPseudoRandomBytes(256 * 1024);
    await storage.write({ key, data, signal, vars: {} });
    const controller = new AbortController();
    const reason = new Error("テスト用の中断");
    const reader = storage.getReadable({ key, signal: controller.signal }).getReader();

    // 実行
    controller.abort(reason);

    // 検証
    // Node.js の読み取りストリームは中断理由を cause に持つ AbortError を返します。
    await expect(reader.read()).rejects.toMatchObject({ name: "AbortError", cause: reason });
  });
});
