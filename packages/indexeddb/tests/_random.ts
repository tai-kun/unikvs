/**
 * mulberry32 による決定的な擬似乱数生成器です。
 * 乱数に依存するテストで固定 seed から同じ入力列を再現するために使用します。
 */
export type Random = {
  next(): number;
  int(min: number, max: number): number;
  uint(max?: number): number;
  bool(): boolean;
  pick<T>(items: readonly T[]): T;
  bytes(length: number): Uint8Array<ArrayBuffer>;
  string(length: number): string;
  array<T>(length: number, generate: () => T): T[];
  shuffle<T>(items: readonly T[]): T[];
};

/**
 * 文字列生成に使う文字の一覧です。
 * ASCII だけでなく制御文字や非 BMP 文字を含むキーの検証に使用します。
 */
const CHARACTERS = [
  "a",
  "b",
  "c",
  "x",
  "y",
  "z",
  "0",
  "1",
  "2",
  "3",
  " ",
  "\n",
  "\t",
  "\u0000",
  "🔑",
  "日",
  "本",
] as const;

/**
 * mulberry32 で seed から決定的な乱数生成器を生成します。
 * 乱数に依存するテストを seed 固定で再現可能にするために使用します。
 */
export function createRandom(seed: number): Random {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };

  const uint = (max = 0x100000000): number => Math.floor(next() * max);

  const int = (min: number, max: number): number => min + uint(max - min + 1);

  const bool = (): boolean => next() < 0.5;

  const pick = <T>(items: readonly T[]): T => items[uint(items.length)]!;

  const bytes = (length: number): Uint8Array<ArrayBuffer> => {
    const result = new Uint8Array(length);
    for (let index = 0; index < length; index++) {
      result[index] = uint(256);
    }
    return result;
  };

  const string = (length: number): string =>
    Array.from({ length }, () => pick(CHARACTERS)).join("");

  const array = <T>(length: number, generate: () => T): T[] =>
    Array.from({ length }, () => generate());

  const shuffle = <T>(items: readonly T[]): T[] => {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index--) {
      const swapIndex = uint(index + 1);
      const value = result[index]!;
      result[index] = result[swapIndex]!;
      result[swapIndex] = value;
    }
    return result;
  };

  return { next, int, uint, bool, pick, bytes, string, array, shuffle };
}

/**
 * count 回のケースを同期実行し、失敗したケースの seed と index をメッセージに含めて投げ直します。
 * 乱数を使うテストの失敗箇所を再現しやすくするために使用します。
 */
export function forCases(
  seed: number,
  count: number,
  run: (random: Random, index: number) => void,
): void {
  const random = createRandom(seed);
  for (let index = 0; index < count; index++) {
    try {
      run(random, index);
    } catch (error) {
      throw new Error(`ケース ${index} が失敗しました (seed: ${seed})`, { cause: error });
    }
  }
}

/**
 * forCases の非同期版です。
 * 非同期 API を対象にした乱数テストの失敗箇所を再現しやすくするために使用します。
 */
export async function forCasesAsync(
  seed: number,
  count: number,
  run: (random: Random, index: number) => Promise<void>,
): Promise<void> {
  const random = createRandom(seed);
  for (let index = 0; index < count; index++) {
    try {
      await run(random, index);
    } catch (error) {
      throw new Error(`ケース ${index} が失敗しました (seed: ${seed})`, { cause: error });
    }
  }
}
