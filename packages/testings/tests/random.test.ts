import { describe, test } from "vitest";

import { createRandom, forCases, forCasesAsync } from "../src/random.js";

describe("createRandom", () => {
  test("同じ seed からは同じ数列を生成する", ({ expect }) => {
    // 準備
    const first = createRandom(20260930);
    const second = createRandom(20260930);

    // 実行
    const firstValues = Array.from({ length: 10 }, () => first.next());
    const secondValues = Array.from({ length: 10 }, () => second.next());

    // 検証
    expect(firstValues).toStrictEqual(secondValues);
  });

  test("異なる seed では異なる数列になる", ({ expect }) => {
    // 準備
    const first = createRandom(1);
    const second = createRandom(2);

    // 実行
    const firstValues = Array.from({ length: 16 }, () => first.next());
    const secondValues = Array.from({ length: 16 }, () => second.next());

    // 検証
    expect(firstValues).not.toStrictEqual(secondValues);
  });

  test("int と uint は指定範囲に収まる", ({ expect }) => {
    // 準備
    const random = createRandom(3);

    // 実行と検証
    for (let index = 0; index < 100; index++) {
      expect(random.int(3, 7)).toBeGreaterThanOrEqual(3);
      expect(random.int(3, 7)).toBeLessThanOrEqual(7);
      expect(random.uint(16)).toBeGreaterThanOrEqual(0);
      expect(random.uint(16)).toBeLessThanOrEqual(16);
    }
  });

  test("bytes と string は指定長になり shuffle は内容を保つ", ({ expect }) => {
    // 準備
    const random = createRandom(4);

    // 実行
    const bytes = random.bytes(32);
    const text = random.string(12);
    const shuffled = random.shuffle([1, 2, 3, 4, 5]);
    const picked = random.pick([10, 20, 30]);
    const flag = random.bool();
    const value = random.next();

    // 検証
    expect(bytes).toHaveLength(32);
    expect(text).toHaveLength(12);
    expect(text).toMatch(/^[a-z0-9]+$/);
    expect([...shuffled].sort((a, b) => a - b)).toStrictEqual([1, 2, 3, 4, 5]);
    expect([10, 20, 30]).toContain(picked);
    expect(typeof flag).toBe("boolean");
    expect(value).toBeGreaterThanOrEqual(0);
  });

  test("string は指定した文字集合からのみ作られる", ({ expect }) => {
    // 準備
    const random = createRandom(5);

    // 実行
    const text = random.string(16, ["a", "b"]);

    // 検証
    expect(text).toMatch(/^[ab]+$/);
  });

  test("pick は空の配列に対して RangeError を投げる", ({ expect }) => {
    // 準備
    const random = createRandom(6);

    // 実行と検証
    expect(() => random.pick([])).toThrow(RangeError);
  });

  test("不正な範囲に対して RangeError を投げる", ({ expect }) => {
    // 準備
    const random = createRandom(8);

    // 実行と検証
    expect(() => random.int(5, 3)).toThrow(RangeError);
    expect(() => random.uint(-1)).toThrow(RangeError);
    expect(() => random.string(4, [])).toThrow(RangeError);
  });

  test("array は生成関数に random と index を渡す", ({ expect }) => {
    // 準備
    const random = createRandom(7);

    // 実行
    const values = random.array(3, (child, index) => `${index}:${child.int(0, 0)}`);

    // 検証
    expect(values).toStrictEqual(["0:0", "1:0", "2:0"]);
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

  test("失敗したケースの seed と index を報告する", ({ expect }) => {
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
      } catch (caught) {
        return caught;
      }

      return undefined;
    })();

    // 検証
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("seed: 100");
    expect((error as Error).message).toContain("index: 3");
    expect((error as Error).cause).toBe(original);
  });

  test("forCasesAsync は失敗したケースの cause を保つ", async ({ expect }) => {
    // 準備
    const original = new Error("元の失敗");

    // 実行
    const error = await forCasesAsync(200, 5, async (_random, index) => {
      if (index === 2) {
        throw original;
      }
    }).catch((caught: unknown) => caught);

    // 検証
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("seed: 200");
    expect((error as Error).message).toContain("index: 2");
    expect((error as Error).cause).toBe(original);
  });
});
