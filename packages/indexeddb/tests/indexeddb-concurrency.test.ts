import { describe } from "vitest";

import { test } from "./_helpers.js";

const { signal } = new AbortController();

describe("並行操作", () => {
  test("同じキーへ並行に write したとき、いずれかの値がそのまま残る", async ({
    expect,
    storage,
  }) => {
    // 準備
    await storage.open({ signal });
    const values = ["v1", "v2", "v3", "v4", "v5"];

    // 実行
    await Promise.all(
      values.map(async (value) => storage.write({ key: "k1", data: value, signal })),
    );

    // 検証
    expect(values).toContain(await storage.read({ key: "k1", signal }));
  });

  test("同じキーへストリームで並行に書いたとき、いずれかの値がそのまま残る", async ({
    expect,
    storage,
  }) => {
    // 準備
    await storage.open({ signal });
    const values = [new Uint8Array([1, 1]), new Uint8Array([2, 2]), new Uint8Array([3, 3])];

    // 実行
    await Promise.all(
      values.map(async (value) => {
        const writer = storage.getWritable({ key: "k1", signal }).getWriter();
        await writer.write(value);
        await writer.close();
      }),
    );

    // 検証
    const result: number[] = await storage.read({ key: "k1", signal });
    expect(values.map((value) => [...value])).toContainEqual([...result]);
  });

  test("異なるキーへ並行に write しても互いに干渉しない", async ({ expect, storage }) => {
    // 準備
    await storage.open({ signal });
    const entries = Array.from({ length: 30 }, (_, i) => ({
      key: `key/${i}`,
      value: `v${i}`,
    }));

    // 実行
    await Promise.all(
      entries.map(async ({ key, value }) => storage.write({ key, data: value, signal })),
    );

    // 検証
    for (const { key, value } of entries) {
      expect(await storage.read({ key, signal })).toBe(value);
    }
  });

  test("40 個のキーへ並行にストリームで書き込んでもすべて読み取れる", async ({
    expect,
    storage,
  }) => {
    // 準備
    await storage.open({ signal });
    const entries = Array.from({ length: 40 }, (_, i) => ({
      key: `key/${i}`,
      chunks: [new Uint8Array([i % 256]), new Uint8Array([255 - (i % 256)])],
    }));

    // 実行
    await Promise.all(
      entries.map(async ({ key, chunks }) => {
        const writer = storage.getWritable({ key, signal }).getWriter();
        for (const chunk of chunks) {
          await writer.write(chunk);
        }
        await writer.close();
      }),
    );

    // 検証
    for (const { key, chunks } of entries) {
      expect(await storage.read({ key, signal })).toStrictEqual(
        new Uint8Array([...chunks[0]!, ...chunks[1]!]),
      );
    }
  });

  test("write と read を同時に実行してもすべて成功する", async ({ expect, storage }) => {
    // 準備
    await storage.open({ signal });
    await storage.write({ key: "k1", data: "initial", signal });
    const written: string[] = [];
    const tasks: Promise<unknown>[] = [];

    // 実行
    for (let i = 0; i < 30; i++) {
      if (i % 2 === 0) {
        const value = `v${i}`;
        written.push(value);
        tasks.push(storage.write({ key: "k1", data: value, signal }));
      } else {
        tasks.push(storage.read({ key: "k1", signal }));
      }
    }
    await Promise.all(tasks);

    // 検証
    expect(written).toContain(await storage.read({ key: "k1", signal }));
  });

  test("同じキーへ並行に delete してもすべて成功し、キーは消える", async ({ expect, storage }) => {
    // 準備
    await storage.open({ signal });
    await storage.write({ key: "k1", data: "v1", signal });

    // 実行
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, async () => storage.delete({ key: "k1", signal })),
    );

    // 検証
    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    expect(await storage.exists({ key: "k1", signal })).toBe(false);
  });
});
