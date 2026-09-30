import { describe, test } from "vitest";

import { createRandom, forCases, forCasesAsync } from "./_random.js";

describe("createRandom", () => {
  test("同じ seed からは同じ系列が得られる", ({ expect }) => {
    // 準備
    const a = createRandom(12345);
    const b = createRandom(12345);

    // 実行
    const seriesA = Array.from({ length: 20 }, () => a.next());
    const seriesB = Array.from({ length: 20 }, () => b.next());

    // 検証
    expect(seriesA).toStrictEqual(seriesB);
  });

  test("異なる seed では系列が異なる", ({ expect }) => {
    // 準備
    const a = createRandom(1);
    const b = createRandom(2);

    // 実行
    const seriesA = Array.from({ length: 8 }, () => a.next());
    const seriesB = Array.from({ length: 8 }, () => b.next());

    // 検証
    expect(seriesA).not.toStrictEqual(seriesB);
  });

  test("int は指定範囲の整数を返す", ({ expect }) => {
    // 準備
    const rng = createRandom(42);

    // 実行と検証
    for (let i = 0; i < 200; i++) {
      const value = rng.int(3, 7);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(7);
    }
    expect(rng.int(5, 5)).toBe(5);
  });

  test("uint は指定上限未満を返し、省略時は 32 ビット符号なし整数を返す", ({ expect }) => {
    // 準備
    const rng = createRandom(7);

    // 実行と検証
    for (let i = 0; i < 200; i++) {
      const small = rng.uint(10);
      expect(small).toBeGreaterThanOrEqual(0);
      expect(small).toBeLessThan(10);

      const large = rng.uint();
      expect(large).toBeGreaterThanOrEqual(0);
      expect(large).toBeLessThanOrEqual(0xffffffff);
    }
  });

  test("bytes・string・array は指定長の値を返す", ({ expect }) => {
    // 準備
    const rng = createRandom(99);

    // 実行と検証
    expect(rng.bytes(0).byteLength).toBe(0);
    expect(rng.bytes(17).byteLength).toBe(17);
    expect(rng.string(0)).toBe("");
    expect(rng.string(12)).toHaveLength(12);
    expect(rng.array(5, (r) => r.int(0, 9))).toHaveLength(5);
  });

  test("shuffle は元配列を変更せず要素の集合を保つ", ({ expect }) => {
    // 準備
    const rng = createRandom(2026);
    const items = [1, 2, 3, 4, 5, 6, 7, 8];

    // 実行
    const shuffled = rng.shuffle(items);

    // 検証
    expect(items).toStrictEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...shuffled].sort((a, b) => a - b)).toStrictEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  test("pick は空配列に対してエラーを投げる", ({ expect }) => {
    // 準備
    const rng = createRandom(1);

    // 実行と検証
    expect(() => rng.pick([])).toThrow("items must not be empty");
  });
});

describe("forCases", () => {
  test("count 回ケースを実行する", ({ expect }) => {
    // 準備
    let count = 0;

    // 実行
    forCases(10, 4, () => {
      count++;
    });

    // 検証
    expect(count).toBe(4);
  });

  test("失敗時に seed とケース番号を含む Error を cause 付きで投げる", ({ expect }) => {
    // 準備
    const failure = new Error("boom");

    // 実行
    let thrown: unknown;
    try {
      forCases(123, 5, (_rng, index) => {
        if (index === 3) {
          throw failure;
        }
      });
    } catch (ex) {
      thrown = ex;
    }

    // 検証
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain("case 3");
    expect((thrown as Error).message).toContain("seed=123");
    expect((thrown as Error).cause).toBe(failure);
  });

  test("非同期版も count 回実行し、失敗を cause 付きで報告する", async ({ expect }) => {
    // 準備
    const failure = new Error("async boom");
    let count = 0;

    // 実行と検証
    await forCasesAsync(456, 3, async () => {
      count++;
    });
    expect(count).toBe(3);

    const thrown = await forCasesAsync(456, 4, async (_rng, index) => {
      if (index === 1) {
        throw failure;
      }
    }).catch((ex: unknown) => ex);
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain("case 1");
    expect((thrown as Error).message).toContain("seed=456");
    expect((thrown as Error).cause).toBe(failure);
  });
});
