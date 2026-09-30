/**
 * 決定的な乱数生成器です。mulberry32 を採用しており、同じ seed からは常に同じ数列を生成します。
 */
export type Random = {
  readonly next: () => number;
  readonly int: (min: number, max: number) => number;
  readonly uint: (max?: number) => number;
  readonly bool: () => boolean;
  readonly pick: <T>(items: readonly T[]) => T;
  readonly bytes: (length: number) => Uint8Array<ArrayBuffer>;
  readonly string: (length: number) => string;
  readonly array: <T>(length: number, gen: () => T) => T[];
  readonly shuffle: <T>(items: readonly T[]) => T[];
};

/**
 * seed から決定的な乱数生成器を作成します。
 * プロパティーテストの入力を再現可能にするために使用します。
 */
export function createRandom(seed: number): Random {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number): number => {
    if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
      throw new Error(`無効な整数範囲です: ${min}..${max}`);
    }

    return min + Math.floor(next() * (max - min + 1));
  };

  const uint = (max: number = 0xffffffff): number => {
    return int(0, max);
  };

  const bool = (): boolean => {
    return next() < 0.5;
  };

  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) {
      throw new Error("空の配列から要素を選ぶことはできません");
    }

    return items[int(0, items.length - 1)]!;
  };

  const characters = Array.from("abcXYZ0189 _-/.あ漢🔑");

  const string = (length: number): string => {
    if (!Number.isInteger(length) || length < 0) {
      throw new Error(`無効な文字列長です: ${length}`);
    }

    let result = "";

    for (let index = 0; index < length; index++) {
      result += characters[int(0, characters.length - 1)]!;
    }

    return result;
  };

  const bytes = (length: number): Uint8Array<ArrayBuffer> => {
    if (!Number.isInteger(length) || length < 0) {
      throw new Error(`無効なバイト長です: ${length}`);
    }

    const result = new Uint8Array(length);

    for (let index = 0; index < length; index++) {
      result[index] = uint(255);
    }

    return result;
  };

  const array = <T>(length: number, gen: () => T): T[] => {
    if (!Number.isInteger(length) || length < 0) {
      throw new Error(`無効な配列長です: ${length}`);
    }

    const result: T[] = [];

    for (let index = 0; index < length; index++) {
      result.push(gen());
    }

    return result;
  };

  const shuffle = <T>(items: readonly T[]): T[] => {
    const result = [...items];

    for (let index = result.length - 1; index > 0; index--) {
      const other = int(0, index);
      const temporary = result[index]!;
      result[index] = result[other]!;
      result[other] = temporary;
    }

    return result;
  };

  return { next, int, uint, bool, pick, bytes, string, array, shuffle };
}

/**
 * 決定的な乱数を用いて count 回ケースを実行します。
 * 失敗時は seed とケース番号を含む Error を元の例外を cause として投げ、再現に必要な情報を残します。
 */
export function forCases(
  seed: number,
  count: number,
  fn: (random: Random, index: number) => void,
): void {
  const random = createRandom(seed);

  for (let index = 0; index < count; index++) {
    try {
      fn(random, index);
    } catch (ex) {
      throw new Error(`ケース ${index} が失敗しました (seed: ${seed})`, { cause: ex });
    }
  }
}

/**
 * forCases の非同期版です。await を挟むケースを同じ形式で再現可能に実行します。
 */
export async function forCasesAsync(
  seed: number,
  count: number,
  fn: (random: Random, index: number) => Promise<void>,
): Promise<void> {
  const random = createRandom(seed);

  for (let index = 0; index < count; index++) {
    try {
      await fn(random, index);
    } catch (ex) {
      throw new Error(`ケース ${index} が失敗しました (seed: ${seed})`, { cause: ex });
    }
  }
}
