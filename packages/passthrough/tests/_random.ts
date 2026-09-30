/**
 * 決定的な PRNG とケース実行ヘルパーです。
 * 外部依存なしで、固定 seed から再現可能なファズテストを行うために使用します。
 */
export type Random = {
  next(): number;
  bool(): boolean;
  int(min: number, max: number): number;
  uint(max?: number): number;
  pick<T>(items: readonly T[]): T;
  bytes(length: number): Uint8Array<ArrayBuffer>;
  string(length: number): string;
  array<T>(length: number, generate: () => T): T[];
  shuffle<T>(items: readonly T[]): T[];
};

/**
 * mulberry32 による決定的な乱数生成器を作成します。
 * seed が同じであれば常に同じ値を返します。
 */
export function createRandom(seed: number): Random {
  let state = seed >>> 0;

  function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  }

  function bool(): boolean {
    return next() < 0.5;
  }

  function uint(max = 0xffff_ffff): number {
    return Math.floor(next() * (max + 1));
  }

  function int(min: number, max: number): number {
    return min + uint(max - min);
  }

  function pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error("pick の対象が空です。");
    }

    return items[uint(items.length - 1)]!;
  }

  function bytes(length: number): Uint8Array<ArrayBuffer> {
    const result = new Uint8Array(length);

    for (let index = 0; index < length; index++) {
      result[index] = uint(0xff);
    }

    return result;
  }

  function string(length: number): string {
    let result = "";

    for (let index = 0; index < length; index++) {
      result += String.fromCharCode(int(0x20, 0x7e));
    }

    return result;
  }

  function array<T>(length: number, generate: () => T): T[] {
    return Array.from({ length }, () => generate());
  }

  function shuffle<T>(items: readonly T[]): T[] {
    const result = [...items];

    for (let index = result.length - 1; index > 0; index--) {
      const target = uint(index);
      const value = result[index]!;
      result[index] = result[target]!;
      result[target] = value;
    }

    return result;
  }

  return { next, bool, int, uint, pick, bytes, string, array, shuffle };
}

/**
 * 同一の PRNG を count 回呼び出してケースを実行します。
 * 失敗したケース番号と seed を error に含め、再現と原因の特定を容易にするために使用します。
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
