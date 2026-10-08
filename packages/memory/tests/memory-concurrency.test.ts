import { describe, test as vitest } from "vitest";

import Memory from "../src/memory.js";

/**
 * テストごとに空の Memory インスタンスを提供します。
 * 複数の非同期操作を並行実行したときの整合性を検証するために使用します。
 */
const test = vitest.extend<{ storage: Memory }>({
  // oxlint-disable-next-line no-empty-pattern
  async storage({}, use) {
    await use(new Memory());
  },
});

describe("並行操作", () => {
  test("同じキーへ並行に書き込んだとき、いずれかの書き込み結果がそのまま残る", async ({
    expect,
    storage,
  }) => {
    // 準備
    const key = "k1";
    const values = [new Uint8Array([1, 1]), new Uint8Array([2, 2]), new Uint8Array([3, 3])];

    // 実行
    await Promise.all(
      values.map(async (value) => {
        const writer = storage.getWritable({ vars: {}, key }).getWriter();
        await writer.write(value);
        await writer.close();
      }),
    );

    // 検証
    const result = storage.read({ key }) as Uint8Array;
    expect(values.map((value) => [...value])).toContainEqual([...result]);
  });

  test("同じキーへ順番に書き込んだとき、最後の値が保存される", async ({ expect, storage }) => {
    // 準備
    const key = "k1";
    const values = [new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3])];

    // 実行
    for (const value of values) {
      const writer = storage.getWritable({ vars: {}, key }).getWriter();
      await writer.write(value);
      await writer.close();
    }

    // 検証
    expect(storage.read({ key })).toStrictEqual(values.at(-1));
  });

  test("異なるキーへ並行に書き込んでも互いに干渉しない", async ({ expect, storage }) => {
    // 準備
    const entries = Array.from({ length: 20 }, (_, i) => ({
      key: `key/${i}`,
      value: new Uint8Array([i]),
    }));

    // 実行
    await Promise.all(
      entries.map(async ({ key, value }) => {
        const writer = storage.getWritable({ vars: {}, key }).getWriter();
        await writer.write(value);
        await writer.close();
      }),
    );

    // 検証
    for (const { key, value } of entries) {
      expect(storage.read({ key })).toStrictEqual(value);
    }
  });

  test("100 個のキーへ並行に書き込んでもすべて読み取れる", async ({ expect, storage }) => {
    // 準備
    const entries = Array.from({ length: 100 }, (_, i) => ({
      key: `key/${i}`,
      chunks: [new Uint8Array([i % 256]), new Uint8Array([255 - (i % 256)])],
    }));

    // 実行
    await Promise.all(
      entries.map(async ({ key, chunks }) => {
        const writer = storage.getWritable({ vars: {}, key }).getWriter();
        for (const chunk of chunks) {
          await writer.write(chunk);
        }
        await writer.close();
      }),
    );

    // 検証
    for (const { key, chunks } of entries) {
      expect(storage.read({ key })).toStrictEqual(new Uint8Array([...chunks[0]!, ...chunks[1]!]));
    }
  });

  test("書き込みと読み取りを交互に実行してもデータは壊れない", async ({ expect, storage }) => {
    // 準備
    const key = "k1";
    storage.write({ vars: {}, key, data: "initial" });

    // 実行
    const tasks = Array.from({ length: 50 }, (_, i) =>
      i % 2 === 0
        ? Promise.resolve().then(() => storage.write({ vars: {}, key, data: `v${i}` }))
        : Promise.resolve().then(() => storage.read({ key })),
    );
    await Promise.all(tasks);

    // 検証
    expect(storage.read({ key })).toBe("v48");
  });

  test("同じキーへの並行 delete は 1 つだけ成功する", async ({ expect, storage }) => {
    // 準備
    const key = "k1";
    storage.write({ vars: {}, key, data: "v1" });

    // 実行
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => Promise.resolve().then(() => storage.delete({ key }))),
    );

    // 検証
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(4);
    expect(storage.exists({ key })).toBe(false);
  });
});
