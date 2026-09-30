/**
 * 固定 seed から決定的な値を生成する擬似乱数生成器です。
 */
export type Random = {
  /**
   * [0, 1) の範囲の小数を返します。
   */
  next(): number;

  /**
   * [min, max] の範囲の整数を返します。
   */
  int(min: number, max: number): number;

  /**
   * [0, max] の範囲の符号なし整数を返します。
   */
  uint(max?: number): number;

  /**
   * 真偽値を返します。
   */
  bool(): boolean;

  /**
   * 配列から 1 つの要素を選んで返します。
   */
  pick<T>(items: readonly T[]): T;

  /**
   * 指定長のランダムなバイト列を返します。
   */
  bytes(length: number): Uint8Array;

  /**
   * 指定長のランダムな ASCII 文字列を返します。
   */
  string(length: number): string;

  /**
   * 指定長の配列を生成関数から作ります。
   */
  array<T>(length: number, generate: (index: number) => T): T[];

  /**
   * 要素をシャッフルした新しい配列を返します。
   */
  shuffle<T>(items: readonly T[]): T[];
};

const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/**
 * mulberry32 による決定的な擬似乱数生成器を作ります。
 * 乱数に依存するテストの再現性を保つために使用します。
 */
export function createRandom(seed: number): Random {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x1_0000_0000;
  };
  const uint = (max = 0xffff_ffff): number => Math.floor(next() * (max + 1));

  return {
    next,
    uint,
    int: (min, max) => min + uint(max - min),
    bool: () => next() < 0.5,
    pick: (items) => items[uint(items.length - 1)]!,
    bytes: (length) => Uint8Array.from({ length }, () => uint(255)),
    string: (length) => {
      let result = "";
      for (let i = 0; i < length; i++) {
        result += CHARSET[uint(CHARSET.length - 1)]!;
      }
      return result;
    },
    array: (length, generate) => Array.from({ length }, (_, index) => generate(index)),
    shuffle: (items) => {
      const result = [...items];
      for (let i = result.length - 1; i > 0; i--) {
        const j = uint(i);
        [result[i], result[j]] = [result[j]!, result[i]!];
      }
      return result;
    },
  };
}

/**
 * 失敗したケースを特定できるメッセージを作ります。
 */
function caseErrorMessage(seed: number, index: number, cause: unknown): string {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return `ケース ${index} (seed: ${seed}) で失敗しました: ${detail}`;
}

/**
 * 固定 seed の乱数で同期処理を count 回実行します。
 * 失敗した場合は case index と seed を含む Error を cause 付きで投げ直します。
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
    } catch (cause) {
      throw new Error(caseErrorMessage(seed, index, cause), { cause });
    }
  }
}

/**
 * 固定 seed の乱数で非同期処理を count 回実行します。
 * 失敗した場合は case index と seed を含む Error を cause 付きで投げ直します。
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
    } catch (cause) {
      throw new Error(caseErrorMessage(seed, index, cause), { cause });
    }
  }
}
