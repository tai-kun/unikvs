import type { IStorage } from "@unikvs/core";
import {
  bytesEqual,
  createAllByteValues,
  createDeleteContext,
  createGetContext,
  createHasContext,
  createOpenContext,
  createSetContext,
} from "@unikvs/testing";
import { describe } from "vitest";

import { test } from "./_helpers.js";

describe("並行実行", () => {
  test("同じキーへ異なるデータを同時に書き込むと、いずれか 1 つが完全な状態で残る", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "race.bin";
    const candidates = [
      createAllByteValues(100),
      createAllByteValues(200).fill(7),
      createAllByteValues(300).fill(200),
    ];
    storage.open(createOpenContext() as IStorage.OpenContext);

    // 実行
    await Promise.all(
      candidates.map((data) =>
        storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data),
      ),
    );
    const result = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);

    // 検証
    expect(candidates.some((candidate) => bytesEqual(result, candidate))).toBe(true);
  });

  test("同じキーへ同じデータを 30 並列で書き込むと全て成功して内容が一致する", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const key = "same-key-30.bin";
    const data = createAllByteValues(64 * 1024);
    storage.open(createOpenContext() as IStorage.OpenContext);

    // 実行
    await Promise.all(
      Array.from({ length: 30 }, () =>
        storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data),
      ),
    );
    const result = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);

    // 検証
    expect(bytesEqual(result, data)).toBe(true);
  });

  test("30 個の異なるキーを並列に書き込むと全て読み戻せる", async ({ expect, signal, storage }) => {
    // 準備
    const entries = Array.from({ length: 30 }, (_, index) => ({
      key: `parallel/${index}.bin`,
      data: createAllByteValues(index * 37 + 1),
    }));
    storage.open(createOpenContext() as IStorage.OpenContext);

    // 実行
    await Promise.all(
      entries.map(({ key, data }) =>
        storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data),
      ),
    );
    const results = await Promise.all(
      entries.map(({ key }) =>
        storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
      ),
    );

    // 検証
    for (const [index, result] of results.entries()) {
      const expected = entries[index]!.data;
      expect(bytesEqual(result, expected)).toBe(true);
    }
  });

  test("書き込みと読み取りを並行しても各キーのデータは壊れない", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const keys = Array.from({ length: 10 }, (_, index) => `mixed/${index}.bin`);
    const oldData = createAllByteValues(256).fill(1);
    const newData = createAllByteValues(512).fill(2);
    storage.open(createOpenContext() as IStorage.OpenContext);
    await Promise.all(
      keys.map((key) =>
        storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, oldData),
      ),
    );

    // 実行
    const observations: boolean[] = [];
    await Promise.all([
      ...keys.map((key) =>
        storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, newData),
      ),
      ...keys.map(async (key) => {
        const result = await storage.read(
          createGetContext(key, { signal }) as IStorage.ReadContext,
        );
        observations.push(bytesEqual(result, oldData) || bytesEqual(result, newData));
      }),
    ]);

    // 検証
    for (const observation of observations) {
      expect(observation).toBe(true);
    }
    for (const key of keys) {
      const result = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);
      expect(bytesEqual(result, newData)).toBe(true);
    }
  });

  test("同じキーへの並列 delete が全て成功する", async ({ expect, signal, storage }) => {
    // 準備
    const key = "parallel-delete.bin";
    storage.open(createOpenContext() as IStorage.OpenContext);
    await storage.write(
      createSetContext(key, { signal }) as IStorage.WriteContext,
      new Uint8Array([1]),
    );

    // 実行
    await Promise.all(
      Array.from({ length: 5 }, () =>
        storage.delete(createDeleteContext(key, { signal }) as IStorage.DeleteContext),
      ),
    );

    // 検証
    await expect(
      storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext),
    ).resolves.toBe(false);
  });

  test("並列書き込みの一部を削除しても残りのキーは影響を受けない", async ({
    expect,
    signal,
    storage,
  }) => {
    // 準備
    const entries = Array.from({ length: 20 }, (_, index) => ({
      key: `bulk-delete/${index}.bin`,
      data: new Uint8Array([index]),
    }));
    storage.open(createOpenContext() as IStorage.OpenContext);
    await Promise.all(
      entries.map(({ key, data }) =>
        storage.write(createSetContext(key, { signal }) as IStorage.WriteContext, data),
      ),
    );

    // 実行
    const removed = entries.filter((_, index) => index % 2 === 0);
    const kept = entries.filter((_, index) => index % 2 === 1);
    await Promise.all(
      removed.map(({ key }) =>
        storage.delete(createDeleteContext(key, { signal }) as IStorage.DeleteContext),
      ),
    );

    // 検証
    for (const { key } of removed) {
      await expect(
        storage.exists(createHasContext(key, { signal }) as IStorage.ExistsContext),
      ).resolves.toBe(false);
    }
    for (const { key, data } of kept) {
      await expect(
        storage.read(createGetContext(key, { signal }) as IStorage.ReadContext),
      ).resolves.toStrictEqual(data);
    }
  });
});
