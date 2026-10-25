import type { IStorage } from "@unikvs/core";
import {
  createGetContext,
  createHasContext,
  createSetContext,
  createDeleteContext,
} from "@unikvs/testing";
import { test as vitest, describe } from "vite-plus/test";

import Memory from "../src/memory.js";

/**
 * テストごとに空の Memory インスタンスを提供します。
 * 複数の非同期操作を並行実行したときの整合性を検証するために使用します。
 */
const test = vitest.extend<{ storage: Memory }>({
  async storage({}, use) {
    await use(new Memory());
  },
});
describe("並行操作", () => {
  test("同じキーへ並行に書き込んだとき、いずれかの書き込み結果がそのまま残る", async ({
    expect,
    storage,
  }) => {
    // 準備：
    const key = "k1";
    const values = [new Uint8Array([1, 1]), new Uint8Array([2, 2]), new Uint8Array([3, 3])];

    // 実行：
    await Promise.all(
      values.map(async (value) => {
        const writer = storage
          .getWritable(createSetContext(key) as IStorage.GetWritableContext)
          .getWriter();
        await writer.write(value);
        await writer.close();
      }),
    );

    // 検証：
    const result = storage.read(createGetContext(key) as IStorage.ReadContext) as Uint8Array;
    expect(values.map((value) => [...value])).toContainEqual([...result]);
  });

  test("同じキーへ順番に書き込んだとき、最後の値が保存される", async ({ expect, storage }) => {
    // 準備：
    const key = "k1";
    const values = [new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3])];

    // 実行：
    for (const value of values) {
      const writer = storage
        .getWritable(createSetContext(key) as IStorage.GetWritableContext)
        .getWriter();
      await writer.write(value);
      await writer.close();
    }

    // 検証：
    expect(storage.read(createGetContext(key) as IStorage.ReadContext)).toStrictEqual(
      values.at(-1),
    );
  });

  test("異なるキーへ並行に書き込んでも互いに干渉しない", async ({ expect, storage }) => {
    // 準備：
    const entries = Array.from({ length: 20 }, (_, i) => ({
      key: `key/${i}`,
      value: new Uint8Array([i]),
    }));

    // 実行：
    await Promise.all(
      entries.map(async ({ key, value }) => {
        const writer = storage
          .getWritable(createSetContext(key) as IStorage.GetWritableContext)
          .getWriter();
        await writer.write(value);
        await writer.close();
      }),
    );

    // 検証：
    for (const { key, value } of entries) {
      expect(storage.read(createGetContext(key) as IStorage.ReadContext)).toStrictEqual(value);
    }
  });

  test("100 個のキーへ並行に書き込んでもすべて読み取れる", async ({ expect, storage }) => {
    // 準備：
    const entries = Array.from({ length: 100 }, (_, i) => ({
      key: `key/${i}`,
      chunks: [new Uint8Array([i % 256]), new Uint8Array([255 - (i % 256)])],
    }));

    // 実行：
    await Promise.all(
      entries.map(async ({ key, chunks }) => {
        const writer = storage
          .getWritable(createSetContext(key) as IStorage.GetWritableContext)
          .getWriter();

        for (const chunk of chunks) {
          await writer.write(chunk);
        }

        await writer.close();
      }),
    );

    // 検証：
    for (const { key, chunks } of entries) {
      const first = chunks[0];
      const second = chunks[1];

      // oxlint-disable-next-line vitest/no-conditional-in-test -- ポーリング／後始末の条件分岐はテストの進行に必須のため、使用します。
      if (first === undefined || second === undefined) {
        throw new Error("チャンクが存在しません。");
      }

      expect(storage.read(createGetContext(key) as IStorage.ReadContext)).toStrictEqual(
        new Uint8Array([...first, ...second]),
      );
    }
  });

  test("書き込みと読み取りを交互に実行してもデータは壊れない", async ({ expect, storage }) => {
    // 準備：
    const key = "k1";
    storage.write(createSetContext(key) as IStorage.WriteContext, "initial");

    // 実行：
    const tasks = Array.from({ length: 50 }, (_, i): Promise<void> =>
      (async (): Promise<void> => {
        await Promise.resolve();

        // oxlint-disable-next-line vitest/no-conditional-in-test -- モック／モデルの分岐はテスト対象の挙動再現に必須のため、条件分岐を使用します。
        if (i % 2 === 0) {
          storage.write(createSetContext(key) as IStorage.WriteContext, `v${i}`);
        } else {
          storage.read(createGetContext(key) as IStorage.ReadContext);
        }
      })(),
    );
    await Promise.all(tasks);

    // 検証：
    expect(storage.read(createGetContext(key) as IStorage.ReadContext)).toBe("v48");
  });

  test("同じキーへの並行 delete は 1 つだけ成功する", async ({ expect, storage }) => {
    // 準備：
    const key = "k1";
    storage.write(createSetContext(key) as IStorage.WriteContext, "v1");

    // 実行：
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (): Promise<void> =>
        (async (): Promise<void> => {
          await Promise.resolve();
          storage.delete(createDeleteContext(key) as IStorage.DeleteContext);
        })(),
      ),
    );

    // 検証：
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(4);

    expect(storage.exists(createHasContext(key) as IStorage.ExistsContext)).toBe(false);
  });
});
