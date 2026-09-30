import { describe, test } from "vitest";

import { createRandom, forCases, forCasesAsync } from "./_random.js";

describe("createRandom", () => {
  test("同じ seed からは同じ数列を生成し、異なる seed では異なる数列になる", ({ expect }) => {
    // 準備
    const first = createRandom(20260930);
    const second = createRandom(20260930);
    const others = createRandom(20260931);

    // 実行
    const firstValues = Array.from({ length: 10 }, () => first.next());
    const secondValues = Array.from({ length: 10 }, () => second.next());
    const otherValues = Array.from({ length: 10 }, () => others.next());

    // 検証
    expect(firstValues).toStrictEqual(secondValues);
    expect(firstValues).not.toStrictEqual(otherValues);
  });

  test("next は 0 以上 1 未満の値を返す", ({ expect }) => {
    // 準備
    const random = createRandom(1);

    // 実行と検証
    for (let index = 0; index < 100; index++) {
      const value = random.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  test("int は両端を含む範囲の整数を返す", ({ expect }) => {
    // 準備
    const random = createRandom(2);

    // 実行と検証
    for (let index = 0; index < 100; index++) {
      const value = random.int(3, 7);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(7);
    }
  });

  test("uint は 0 以上 max 未満の整数を返す", ({ expect }) => {
    // 準備
    const random = createRandom(3);

    // 実行と検証
    for (let index = 0; index < 100; index++) {
      const value = random.uint(16);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(16);
    }
  });

  test("bytes と string は指定した長さを返し、bytes の値は 0 以上 255 以下である", ({ expect }) => {
    // 準備
    const random = createRandom(4);

    // 実行
    const bytes = random.bytes(32);
    const text = random.string(12);

    // 検証
    expect(bytes.length).toBe(32);
    expect(bytes.every((byte) => byte >= 0 && byte <= 255)).toBe(true);
    expect(text.length).toBe(12);
  });

  test("shuffle は要素の並びだけを変え、内容は保つ", ({ expect }) => {
    // 準備
    const random = createRandom(5);
    const items = [1, 2, 3, 4, 5];

    // 実行
    const shuffled = random.shuffle(items);

    // 検証
    expect(shuffled).toHaveLength(items.length);
    expect([...shuffled].sort((a, b) => a - b)).toStrictEqual([...items].sort((a, b) => a - b));
  });
});

describe("forCases", () => {
  test("count 回だけ実行する", ({ expect }) => {
    // 準備
    let count = 0;

    // 実行
    forCases(6, 4, () => {
      count += 1;
    });

    // 検証
    expect(count).toBe(4);
  });

  test("失敗したケースの index と seed をメッセージに含める", ({ expect }) => {
    // 準備
    let error: unknown;

    // 実行
    try {
      forCases(123, 5, (_random, index) => {
        if (index === 3) {
          throw new Error("boom");
        }
      });
    } catch (caught) {
      error = caught;
    }

    // 検証
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("3");
    expect((error as Error).message).toContain("123");
    expect(((error as Error).cause as Error).message).toBe("boom");
  });

  test("forCasesAsync は count 回だけ実行する", async ({ expect }) => {
    // 準備
    let count = 0;

    // 実行
    await forCasesAsync(7, 4, async () => {
      count += 1;
    });

    // 検証
    expect(count).toBe(4);
  });

  test("forCasesAsync は失敗したケースの cause を保つ", async ({ expect }) => {
    // 準備
    let error: unknown;

    // 実行
    try {
      await forCasesAsync(456, 3, async (_random, index) => {
        if (index === 2) {
          throw new Error("async boom");
        }
      });
    } catch (caught) {
      error = caught;
    }

    // 検証
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("2");
    expect((error as Error).message).toContain("456");
    expect(((error as Error).cause as Error).message).toBe("async boom");
  });
});
