import { describe } from "vitest";

import S3 from "../src/s3.js";
import { bytesEqual, createAllByteValues, test } from "./_helpers.js";

/**
 * 多数のキーを少量ずつ並列に書き込みます。
 * clear のページネーションを検証するための前準備を現実的な時間で終えるために使用します。
 */
async function writeInBatches(
  storage: S3,
  entries: readonly { key: string; data: Uint8Array<ArrayBuffer> }[],
  signal: AbortSignal,
): Promise<void> {
  const concurrency = 25;

  for (let start = 0; start < entries.length; start += concurrency) {
    await Promise.all(
      entries
        .slice(start, start + concurrency)
        .map(({ key, data }) => storage.write({ key, data, signal })),
    );
  }
}

describe("基本データ操作 (CRUD)", () => {
  test("全 256 種類のバイト値を含むデータが byte-for-byte で往復する", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "all-byte-values.bin";
    const data = createAllByteValues(1024);

    // 実行
    await storage.write({ key, data, signal });
    const result = await storage.read({ key, signal });

    // 検証
    expect(bytesEqual(result, data)).toBe(true);
  });

  test("0x00 だけで構成されたデータが往復する", async ({ expect, signal, storage }) => {
    // 準備
    const key = "zeros.bin";
    const data = new Uint8Array(4096);

    // 実行
    await storage.write({ key, data, signal });
    const result = await storage.read({ key, signal });

    // 検証
    expect(result).toStrictEqual(data);
  });

  test("0xff だけで構成されたデータが往復する", async ({ expect, signal, storage }) => {
    // 準備
    const key = "ones.bin";
    const data = new Uint8Array(4096).fill(0xff);

    // 実行
    await storage.write({ key, data, signal });
    const result = await storage.read({ key, signal });

    // 検証
    expect(result).toStrictEqual(data);
  });

  test("1 バイトのデータが往復する", async ({ expect, signal, storage }) => {
    // 準備
    const key = "one-byte.bin";
    const data = new Uint8Array([0x42]);

    // 実行
    await storage.write({ key, data, signal });

    // 検証
    await expect(storage.read({ key, signal })).resolves.toStrictEqual(data);
  });

  test("5 MiB の単発 write が往復する", async ({ expect, signal, storage }) => {
    // 準備
    const key = "five-mib.bin";
    const data = createAllByteValues(5 * 1024 * 1024);

    // 実行
    await storage.write({ key, data, signal });
    const result = await storage.read({ key, signal });

    // 検証
    expect(bytesEqual(result, data)).toBe(true);
  });

  test("書き込み前に exists は false で、書き込み後に true になる", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "existence.bin";

    // 実行
    const before = await storage.exists({ key, signal });
    await storage.write({ key, data: new Uint8Array([1]), signal });
    const after = await storage.exists({ key, signal });

    // 検証
    expect(before).toBe(false);
    expect(after).toBe(true);
  });

  test("Unicode のテキストデータが byte-for-byte で往復する", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "unicode-data.txt";
    const data = new TextEncoder().encode("こんにちは、世界! 🚀 Ω");

    // 実行
    await storage.write({ key, data, signal });
    const result = await storage.read({ key, signal });

    // 検証
    expect(new TextDecoder().decode(result)).toBe("こんにちは、世界! 🚀 Ω");
  });

  test("0 バイトのオブジェクトは exists が true になる", async ({ expect, signal, storage }) => {
    // 準備
    const key = "zero-length.bin";

    // 実行
    await storage.write({ key, data: new Uint8Array(0), signal });

    // 検証
    await expect(storage.exists({ key, signal })).resolves.toBe(true);
  });

  test("削除を 2 回行っても 2 回目はエラーにならない", async ({ expect, signal, storage }) => {
    // 準備
    const key = "delete-twice.bin";
    await storage.write({ key, data: new Uint8Array([1]), signal });
    await storage.delete({ key, signal });

    // 実行と検証
    await expect(storage.delete({ key, signal })).resolves.toBeUndefined();
    await expect(storage.exists({ key, signal })).resolves.toBe(false);
  });

  test("上書きで長さが短くなっても古いデータが残らない", async ({ expect, signal, storage }) => {
    // 準備
    const key = "shrink.bin";
    const longData = createAllByteValues(1024);
    const shortData = new Uint8Array([1, 2, 3]);
    await storage.write({ key, data: longData, signal });

    // 実行
    await storage.write({ key, data: shortData, signal });

    // 検証
    await expect(storage.read({ key, signal })).resolves.toStrictEqual(shortData);
  });

  test("上書きで長さが長くなっても全体が置き換わる", async ({ expect, signal, storage }) => {
    // 準備
    const key = "grow.bin";
    const shortData = new Uint8Array([1, 2, 3]);
    const longData = createAllByteValues(1024);
    await storage.write({ key, data: shortData, signal });

    // 実行
    await storage.write({ key, data: longData, signal });
    const result = await storage.read({ key, signal });

    // 検証
    expect(bytesEqual(result, longData)).toBe(true);
  });

  test("1 つのキーを削除しても他のキーは残る", async ({ expect, signal, storage }) => {
    // 準備
    await storage.write({ key: "keep-a.bin", data: new Uint8Array([1]), signal });
    await storage.write({ key: "remove.bin", data: new Uint8Array([2]), signal });
    await storage.write({ key: "keep-b.bin", data: new Uint8Array([3]), signal });

    // 実行
    await storage.delete({ key: "remove.bin", signal });

    // 検証
    await expect(storage.exists({ key: "keep-a.bin", signal })).resolves.toBe(true);
    await expect(storage.exists({ key: "remove.bin", signal })).resolves.toBe(false);
    await expect(storage.exists({ key: "keep-b.bin", signal })).resolves.toBe(true);
  });

  test("前方一致する別のキーは互いに干渉しない", async ({ expect, signal, storage }) => {
    // 準備
    const entries = [
      { key: "data", data: new Uint8Array([1]) },
      { key: "data.bak", data: new Uint8Array([2]) },
      { key: "data/child.bin", data: new Uint8Array([3]) },
    ];

    // 実行
    for (const { key, data } of entries) {
      await storage.write({ key, data, signal });
    }
    await storage.delete({ key: "data.bak", signal });

    // 検証
    await expect(storage.read({ key: "data", signal })).resolves.toStrictEqual(new Uint8Array([1]));
    await expect(storage.exists({ key: "data.bak", signal })).resolves.toBe(false);
    await expect(storage.read({ key: "data/child.bin", signal })).resolves.toStrictEqual(
      new Uint8Array([3]),
    );
  });

  test("1000 件を超えるオブジェクトでも clear は全ページを削除する", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    // S3 の 1 ページあたりの上限 (1000) を超える件数でページネーションを発生させる。
    const count = 1050;
    const entries = Array.from({ length: count }, (_, index) => ({
      key: `bulk/${index}.bin`,
      data: new Uint8Array([index % 256]),
    }));
    await writeInBatches(storage, entries, signal);

    // 実行
    await storage.clear({ signal });

    // 検証
    const probes = [0, 1, 999, 1000, count - 2, count - 1];
    for (const index of probes) {
      await expect(storage.exists({ key: `bulk/${index}.bin`, signal })).resolves.toBe(false);
    }
  });
});
