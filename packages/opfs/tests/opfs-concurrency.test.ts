import { describe } from "vitest";

import Opfs from "../src/opfs.js";
import { test } from "./_helpers.js";

const { signal } = new AbortController();

describe("並行実行の振る舞い", () => {
  test("異なるキーへ並列に書き込んだとき、すべてのデータが正しく保存される", async ({
    expect,
    storage,
  }) => {
    // 準備
    const entries = Array.from({ length: 32 }, (_, index) => ({
      key: `parallel-${index}.bin`,
      data: new Uint8Array([index, index + 1, index + 2]),
    }));

    // 実行
    await Promise.all(entries.map(({ key, data }) => storage.write({ key, data, signal })));

    // 検証
    for (const { key, data } of entries) {
      expect(await storage.read({ key, signal })).toStrictEqual(data);
    }
  });

  test("同じキーへ同時に書き込んだとき、どれか 1 つの内容が完全に保存される", async ({
    expect,
    storage,
  }) => {
    // 準備
    const key = "contended.bin";
    const payloads = [
      new Uint8Array([1]),
      new Uint8Array([2, 2]),
      new Uint8Array([3, 3, 3]),
      new Uint8Array(1000).fill(4),
      new Uint8Array(),
    ];

    // 実行
    await Promise.all(payloads.map((data) => storage.write({ key, data, signal })));
    const loaded = await storage.read({ key, signal });

    // 検証
    expect(payloads).toContainEqual(loaded);
  });

  test("書き込みと読み取りを同時に実行したとき、互いの結果が正しい", async ({
    expect,
    storage,
  }) => {
    // 準備
    const existing = Array.from({ length: 16 }, (_, index) => ({
      key: `existing-${index}.bin`,
      data: new Uint8Array([index]),
    }));
    for (const { key, data } of existing) {
      await storage.write({ key, data, signal });
    }

    const fresh = Array.from({ length: 16 }, (_, index) => ({
      key: `fresh-${index}.bin`,
      data: new Uint8Array([index, 255 - index]),
    }));

    // 実行
    const [readResults] = await Promise.all([
      Promise.all(existing.map(({ key }) => storage.read({ key, signal }))),
      Promise.all(fresh.map(({ key, data }) => storage.write({ key, data, signal }))),
    ]);

    // 検証
    for (const [index, result] of readResults.entries()) {
      expect(result).toStrictEqual(existing[index]!.data);
    }

    for (const { key, data } of fresh) {
      expect(await storage.read({ key, signal })).toStrictEqual(data);
    }
  });

  test("複数のインスタンスから同時に操作したとき、同じルートを共有できる", async ({
    expect,
    root,
  }) => {
    // 準備
    const first = new Opfs(root);
    const second = new Opfs(root);
    await first.open({ signal });
    await second.open({ signal });
    const firstEntries = Array.from({ length: 16 }, (_, index) => ({
      key: `first-${index}.bin`,
      data: new Uint8Array([index]),
    }));
    const secondEntries = Array.from({ length: 16 }, (_, index) => ({
      key: `second-${index}.bin`,
      data: new Uint8Array([100 + index]),
    }));

    // 実行
    await Promise.all([
      ...firstEntries.map(({ key, data }) => first.write({ key, data, signal })),
      ...secondEntries.map(({ key, data }) => second.write({ key, data, signal })),
    ]);

    // 検証
    for (const { key, data } of firstEntries) {
      expect(await second.read({ key, signal })).toStrictEqual(data);
    }

    for (const { key, data } of secondEntries) {
      expect(await first.read({ key, signal })).toStrictEqual(data);
    }
  });

  test("40 件の存在確認と読み取りを並列に実行したとき、すべて正しく完了する", async ({
    expect,
    storage,
  }) => {
    // 準備
    const entries = Array.from({ length: 20 }, (_, index) => ({
      key: `mixed-${index}.bin`,
      data: new Uint8Array([index, index + 1]),
    }));
    for (const { key, data } of entries) {
      await storage.write({ key, data, signal });
    }

    // 実行
    const results = await Promise.all([
      ...entries.map(async ({ key }) => ({
        kind: "exists" as const,
        value: await storage.exists({ key, signal }),
      })),
      ...entries.map(async ({ key, data }) => ({
        kind: "read" as const,
        value: await storage.read({ key, signal }),
        expected: data,
      })),
    ]);

    // 検証
    expect(results).toHaveLength(40);
    for (const result of results) {
      if (result.kind === "exists") {
        expect(result.value).toBe(true);
      } else {
        expect(result.value).toStrictEqual(result.expected);
      }
    }
  });
});
