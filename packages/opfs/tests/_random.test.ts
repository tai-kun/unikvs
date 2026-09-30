import { describe, test } from "vitest";

import { createRandom, forCases, forCasesAsync } from "./_random.js";

describe("決定的擬似乱数の振る舞い", () => {
  test("同じシードから同じ数列が生成される", ({ expect }) => {
    // 準備
    const first = createRandom(12345);
    const second = createRandom(12345);

    // 実行
    const firstValues = Array.from({ length: 16 }, () => first.next());
    const secondValues = Array.from({ length: 16 }, () => second.next());

    // 検証
    expect(firstValues).toStrictEqual(secondValues);
  });

  test("異なるシードからは異なる数列が生成される", ({ expect }) => {
    // 準備
    const first = createRandom(1);
    const second = createRandom(2);

    // 実行
    const firstValues = Array.from({ length: 16 }, () => first.next());
    const secondValues = Array.from({ length: 16 }, () => second.next());

    // 検証
    expect(firstValues).not.toStrictEqual(secondValues);
  });

  test("生成される整数がすべて指定範囲に収まる", ({ expect }) => {
    // 準備
    const random = createRandom(67890);

    // 実行
    const values = Array.from({ length: 100 }, () => random.int(3, 7));

    // 検証
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(7);
    }
  });

  test("生成されるバイト列と文字列が指定長になる", ({ expect }) => {
    // 準備
    const random = createRandom(24680);

    // 実行
    const bytes = random.bytes(32);
    const text = random.string(16);

    // 検証
    expect(bytes).toHaveLength(32);
    expect(text).toHaveLength(16);
    expect(text).toMatch(/^[a-z0-9]+$/);
  });

  test("shuffle が要素を欠落させずに並べ替える", ({ expect }) => {
    // 準備
    const random = createRandom(13579);
    const items = [1, 2, 3, 4, 5, 6, 7, 8];

    // 実行
    const shuffled = random.shuffle(items);

    // 検証
    expect([...shuffled].sort((a, b) => a - b)).toStrictEqual(items);
  });

  test("pick が空の配列に対して RangeError を投げる", ({ expect }) => {
    // 準備
    const random = createRandom(1);

    // 実行と検証
    expect(() => random.pick([])).toThrow(RangeError);
  });

  test("forCases が失敗ケースのシードと index を報告する", ({ expect }) => {
    // 準備
    const original = new Error("元の失敗");

    // 実行
    const error = (() => {
      try {
        forCases(100, 5, (_random, index) => {
          if (index === 3) {
            throw original;
          }
        });
      } catch (ex) {
        return ex;
      }

      return undefined;
    })();

    // 検証
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("seed: 100");
    expect((error as Error).message).toContain("index: 3");
    expect((error as Error).cause).toBe(original);
  });

  test("forCasesAsync が失敗ケースのシードと index を報告する", async ({ expect }) => {
    // 準備
    const original = new Error("元の失敗");

    // 実行
    const error = await forCasesAsync(200, 5, async (_random, index) => {
      if (index === 2) {
        throw original;
      }
    }).catch((ex: unknown) => ex);

    // 検証
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("seed: 200");
    expect((error as Error).message).toContain("index: 2");
    expect((error as Error).cause).toBe(original);
  });
});
