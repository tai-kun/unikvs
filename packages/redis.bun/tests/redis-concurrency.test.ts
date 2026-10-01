import { describe } from "vitest";

import { bytesEqual, createPseudoRandomBytes, test } from "./_helpers.js";

describe("並行操作", () => {
  test("異なるキーへ並列に書き込んだとき、すべてのデータが保存される", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const entries = Array.from({ length: 100 }, (_, index) => ({
      key: `parallel/${index}.bin`,
      data: createPseudoRandomBytes(512, index),
    }));

    // 実行
    await Promise.all(entries.map(({ key, data }) => storage.write({ key, data, signal })));

    // 検証
    for (const { key, data } of entries) {
      const result = await storage.read({ key, signal });
      expect(bytesEqual(result, data)).toBe(true);
    }
  });

  test("同じキーへ並列に書き込んだとき、書き込んだうちのどれか 1 つが残る", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "parallel-same-key.bin";
    const payloads = Array.from({ length: 20 }, (_, index) =>
      createPseudoRandomBytes(1024, index + 100),
    );

    // 実行
    await Promise.all(payloads.map((data) => storage.write({ key, data, signal })));

    // 検証
    const result = await storage.read({ key, signal });
    expect(payloads.some((payload) => bytesEqual(result, payload))).toBe(true);
  });

  test("並列に書き込みと削除をしても、存在しないキーの削除でエラーにならない", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "parallel-write-delete.bin";
    const data = new Uint8Array([1, 2, 3]);

    // 実行
    await Promise.all([
      storage.write({ key, data, signal }),
      storage.delete({ key, signal }),
      storage.write({ key, data, signal }),
      storage.delete({ key, signal }),
    ]);

    // 検証
    await expect(storage.delete({ key, signal })).resolves.toBeUndefined();
  });

  test("同じキーを並列に読み取ったとき、すべて同じデータが返る", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "parallel-read.bin";
    const data = createPseudoRandomBytes(64 * 1024, 999);
    await storage.write({ key, data, signal });

    // 実行
    const results = await Promise.all(
      Array.from({ length: 20 }, () => storage.read({ key, signal })),
    );

    // 検証
    for (const result of results) {
      expect(bytesEqual(result, data)).toBe(true);
    }
  });
});
