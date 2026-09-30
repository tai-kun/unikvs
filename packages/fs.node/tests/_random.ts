/**
 * 決定的な擬似乱数生成器の操作一式です。
 * 乱数に依存するテストで固定 seed から再現可能な入力を組み立てるために使用します。
 */
export type Random = {
  /**
   * 0 以上 1 未満の小数を返します。
   */
  next(): number;

  /**
   * min 以上 max 以下の整数を返します。
   */
  int(min: number, max: number): number;

  /**
   * 0 以上 max 未満の整数を返します。
   */
  uint(max?: number): number;

  /**
   * 真偽値を返します。
   */
  bool(): boolean;

  /**
   * 配列から 1 つ選んで返します。
   */
  pick<T>(items: readonly T[]): T;

  /**
   * 指定した長さのランダムなバイト列を返します。
   */
  bytes(length: number): Uint8Array<ArrayBuffer>;

  /**
   * 指定した長さの文字列を返します。alphabet を省略すると英数字になります。
   */
  string(length: number, alphabet?: string | readonly string[]): string;

  /**
   * generate を length 回呼び出して配列を作ります。
   */
  array<T>(length: number, generate: () => T): T[];

  /**
   * 要素をシャッフルした新しい配列を返します。
   */
  shuffle<T>(items: readonly T[]): T[];
};

/**
 * mulberry32 による決定的な疑似乱数生成器を作成します。
 * 同じ seed なら常に同じ系列を返すため、失敗を再現可能にするために使用します。
 */
export function createRandom(seed: number): Random {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };

  const uint = (max = 4294967296): number => Math.floor(next() * max);

  const int = (min: number, max: number): number => min + uint(max - min + 1);

  return {
    next,
    int,
    uint,
    bool: () => next() < 0.5,
    pick: <T>(items: readonly T[]): T => items[int(0, items.length - 1)]!,
    bytes: (length: number): Uint8Array<ArrayBuffer> => {
      const result = new Uint8Array(length);
      for (let index = 0; index < length; index++) {
        result[index] = uint(256);
      }
      return result;
    },
    string: (length: number, alphabet = "abcdefghijklmnopqrstuvwxyz0123456789"): string => {
      const chars = typeof alphabet === "string" ? Array.from(alphabet) : alphabet;
      let result = "";
      for (let index = 0; index < length; index++) {
        result += chars[int(0, chars.length - 1)]!;
      }
      return result;
    },
    array: <T>(length: number, generate: () => T): T[] => Array.from({ length }, () => generate()),
    shuffle: <T>(items: readonly T[]): T[] => {
      const result = [...items];
      for (let index = result.length - 1; index > 0; index--) {
        const target = int(0, index);
        [result[index], result[target]] = [result[target]!, result[index]!];
      }
      return result;
    },
  };
}

/**
 * seed から導いたケースごとの乱数で run を count 回実行します。
 * 失敗したケースの seed と index をメッセージに含め、元の例外を cause に保持するために使用します。
 */
export function forCases(seed: number, count: number, run: (random: Random) => void): void {
  for (let index = 0; index < count; index++) {
    const random = createRandom(seed + index);
    try {
      run(random);
    } catch (error) {
      throw new Error(`決定的ファズテストに失敗しました (seed=${seed}, case=${index})`, {
        cause: error,
      });
    }
  }
}

/**
 * forCases の非同期版です。
 * 非同期処理を含むケースの失敗を seed と index 付きで報告するために使用します。
 */
export async function forCasesAsync(
  seed: number,
  count: number,
  run: (random: Random) => Promise<void>,
): Promise<void> {
  for (let index = 0; index < count; index++) {
    const random = createRandom(seed + index);
    try {
      await run(random);
    } catch (error) {
      throw new Error(`決定的ファズテストに失敗しました (seed=${seed}, case=${index})`, {
        cause: error,
      });
    }
  }
}
