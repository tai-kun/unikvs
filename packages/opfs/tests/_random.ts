/**
 * テスト用の決定的な擬似乱数生成器です。
 * 固定シードのファズテストで再現可能な入力列を生成するために使用します。
 */
export type Random = {
  /**
   * 0 以上 1 未満の実数を返します。
   */
  next(): number;

  /**
   * 0 以上 max 未満の整数を返します。max を省略した場合は 32 ビット符号なし整数の範囲です。
   */
  uint(max?: number): number;

  /**
   * min 以上 max 以下の整数を返します。
   */
  int(min: number, max: number): number;

  /**
   * 真偽値を返します。
   */
  bool(): boolean;

  /**
   * 配列から 1 件選んで返します。
   */
  pick<T>(items: readonly T[]): T;

  /**
   * 指定した長さのバイト列を返します。
   */
  bytes(length: number): Uint8Array<ArrayBuffer>;

  /**
   * 指定した長さの英数字文字列を返します。
   */
  string(length: number): string;

  /**
   * 指定した長さの配列を生成関数から作ります。
   */
  array<T>(length: number, generate: (index: number) => T): T[];

  /**
   * 要素を並べ替えた新しい配列を返します。
   */
  shuffle<T>(items: readonly T[]): T[];
};

/**
 * mulberry32 による決定的な擬似乱数生成器を作成します。
 * 同一シードから常に同一の入力列を生成するために使用します。
 */
export function createRandom(seed: number): Random {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x1_0000_0000;
  };

  const uint = (max = 0x1_0000_0000): number => Math.floor(next() * max);

  return {
    next,
    uint,
    int(min, max) {
      return min + uint(max - min + 1);
    },
    bool() {
      return uint(2) === 1;
    },
    pick(items) {
      if (items.length === 0) {
        throw new RangeError("空の配列からは選択できません");
      }

      return items[uint(items.length)]!;
    },
    bytes(length) {
      const result = new Uint8Array(length);
      for (let index = 0; index < length; index++) {
        result[index] = uint(256);
      }

      return result;
    },
    string(length) {
      const charset = "abcdefghijklmnopqrstuvwxyz0123456789";
      let result = "";
      for (let index = 0; index < length; index++) {
        result += charset[uint(charset.length)]!;
      }

      return result;
    },
    array(length, generate) {
      return Array.from({ length }, (_, index) => generate(index));
    },
    shuffle(items) {
      const result = [...items];
      for (let index = result.length - 1; index > 0; index--) {
        const swapIndex = uint(index + 1);
        const temporary = result[index]!;
        result[index] = result[swapIndex]!;
        result[swapIndex] = temporary;
      }

      return result;
    },
  };
}

/**
 * 同期処理を固定シードで count 回実行します。
 * 失敗したケースの seed と index を報告できるようにするために使用します。
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
      throw new Error(`ケースが失敗しました (seed: ${seed}, index: ${index})`, { cause: error });
    }
  }
}

/**
 * 非同期処理を固定シードで count 回実行します。
 * 失敗したケースの seed と index を報告できるようにするために使用します。
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
      throw new Error(`ケースが失敗しました (seed: ${seed}, index: ${index})`, { cause: error });
    }
  }
}
