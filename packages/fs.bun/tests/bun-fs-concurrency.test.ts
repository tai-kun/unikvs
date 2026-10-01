import { describe } from "vitest";

import BunFs from "../src/bun-fs.js";
import { bytesEqual, createPseudoRandomBytes, listTemporaryFiles, test } from "./_helpers.js";

describe("並行操作", () => {
  test("同じキーへ並行に write したとき、いずれかのデータがそのまま残る", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "same-key.bin";
    const values = Array.from({ length: 10 }, (_, index) => new Uint8Array(4096).fill(index + 1));

    // 実行
    await Promise.all(values.map((data) => storage.write({ key, data, signal })));

    // 検証
    const result = new Uint8Array(await storage.read({ key, signal }));
    expect(result).toHaveLength(4096);
    expect(values.some((value) => bytesEqual(value, result))).toBe(true);
  });

  test("同じキーへ並行にストリーム書き込みしたとき、いずれかのデータがそのまま残る", async ({
    expect,
    root,
    signal,
    storage,
  }) => {
    // 準備
    const key = "same-key-stream.bin";
    const values = Array.from({ length: 8 }, (_, index) =>
      new Uint8Array(64 * 1024).fill(index + 1),
    );

    // 実行
    await Promise.all(
      values.map(async (data) => {
        const writer = (await storage.getWritable({ key, signal })).getWriter();
        await writer.write(data);
        await writer.close();
      }),
    );

    // 検証
    const result = new Uint8Array(await storage.read({ key, signal }));
    expect(result).toHaveLength(64 * 1024);
    expect(values.some((value) => bytesEqual(value, result))).toBe(true);
    expect(await listTemporaryFiles(root)).toStrictEqual([]);
  });

  test("40 個の異なるキーへ並行に書き込んでも互いに干渉しない", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const entries = Array.from({ length: 40 }, (_, index) => ({
      key: `parallel-${index}.bin`,
      data: new Uint8Array(1024).fill(index % 256),
    }));

    // 実行
    await Promise.all(entries.map(({ key, data }) => storage.write({ key, data, signal })));

    // 検証
    for (const { key, data } of entries) {
      expect(bytesEqual(new Uint8Array(await storage.read({ key, signal })), data)).toBe(true);
    }
  });

  test("書き込み中に同じキーを読み取ったとき、古いデータか新しいデータのどちらか完全な方を返す", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "during-write.bin";
    const oldData = new Uint8Array([1, 1, 1]);
    const newData = createPseudoRandomBytes(4 * 1024 * 1024);
    await storage.write({ key, data: oldData, signal });

    // 実行
    const writing = storage.write({ key, data: newData, signal });
    const during = new Uint8Array(await storage.read({ key, signal }));
    await writing;

    // 検証
    expect([oldData, newData].some((value) => bytesEqual(value, during))).toBe(true);
    expect(bytesEqual(new Uint8Array(await storage.read({ key, signal })), newData)).toBe(true);
  });

  test("open を同時に複数回呼び出してもその後の操作が成功する", async ({
    expect,
    root,
    signal,
  }) => {
    // 準備
    const concurrent = new BunFs(root);
    const key = "concurrent-open.bin";
    const data = new Uint8Array([1, 2, 3]);

    // 実行
    await Promise.all([concurrent.open(), concurrent.open(), concurrent.open()]);
    await concurrent.write({ key, data, signal });

    // 検証
    expect(concurrent.isOpen).toBe(true);
    expect(new Uint8Array(await concurrent.read({ key, signal }))).toStrictEqual(data);
  });

  test("数十の混在操作を並行実行してもデータが壊れない", async ({ expect, signal, storage }) => {
    // 準備
    const keys = Array.from({ length: 30 }, (_, index) => `mixed-${index}.bin`);
    const data = keys.map((_, index) => new Uint8Array([index % 256, (index * 7) % 256]));
    await Promise.all(keys.map((key, index) => storage.write({ key, data: data[index]!, signal })));

    // 実行
    const readKeys = keys.slice(0, 15);
    const deleteKeys = keys.slice(15);
    const reads = readKeys.map(async (key, index) => {
      const result = new Uint8Array(await storage.read({ key, signal }));
      expect(bytesEqual(result, data[index]!)).toBe(true);
    });
    const deletes = deleteKeys.map((key) => storage.delete({ key }));
    await Promise.all([...reads, ...deletes]);

    // 検証
    for (const [index, key] of keys.entries()) {
      expect(await storage.exists({ key })).toBe(index < readKeys.length);
    }
  });
});
