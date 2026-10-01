/**
 * 決定的な擬似乱数生成器です。
 * 乱数入りのテストを固定 seed で再現可能にするために使用します。
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
   * 0 以上 max 以下の整数を返します。
   */
  uint(max?: number): number;

  /**
   * 等確率で真偽値を返します。
   */
  bool(): boolean;

  /**
   * 配列から 1 要素を等確率で選びます。
   */
  pick<T>(items: readonly T[]): T;

  /**
   * 指定した長さのランダムなバイト列を返します。
   */
  bytes(length: number): Uint8Array<ArrayBuffer>;

  /**
   * 指定した長さの半角英数字からなる文字列を返します。
   */
  string(length: number): string;

  /**
   * 指定した長さの配列を生成関数で作ります。
   */
  array<T>(length: number, generate: (random: Random, index: number) => T): T[];

  /**
   * 配列を複製して Fisher-Yates 法で並べ替えます。
   */
  shuffle<T>(items: readonly T[]): T[];
};

const ALPHANUMERIC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/**
 * mulberry32 を使った決定的な擬似乱数生成器を作成します。
 * 同じ seed なら常に同じ系列を返すため、テストの再現性を保てます。
 */
export function createRandom(seed: number): Random {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };

  const int = (min: number, max: number): number => {
    return min + Math.floor(next() * (max - min + 1));
  };

  const random: Random = {
    next,
    int,
    uint(max = 0xffffffff) {
      return Math.floor(next() * (max + 1));
    },
    bool() {
      return next() < 0.5;
    },
    pick(items) {
      if (items.length === 0) {
        throw new Error("pick の対象配列が空です");
      }
      return items[int(0, items.length - 1)] as (typeof items)[number];
    },
    bytes(length) {
      const result = new Uint8Array(length);
      for (let index = 0; index < length; index += 1) {
        result[index] = Math.floor(next() * 256);
      }
      return result;
    },
    string(length) {
      let result = "";
      for (let index = 0; index < length; index += 1) {
        result += ALPHANUMERIC.charAt(int(0, ALPHANUMERIC.length - 1));
      }
      return result;
    },
    array(length, generate) {
      return Array.from({ length }, (_, index) => generate(random, index));
    },
    shuffle(items) {
      const result = [...items];
      for (let index = result.length - 1; index > 0; index -= 1) {
        const swapIndex = int(0, index);
        const current = result[index] as (typeof items)[number];
        result[index] = result[swapIndex] as (typeof items)[number];
        result[swapIndex] = current;
      }
      return result;
    },
  };

  return random;
}

/**
 * 指定した回数だけ決定的な乱数ケースを実行します。
 * 失敗した場合は seed とケース番号を含む Error を投げ、元の例外を cause に保持します。
 */
export function forCases(
  seed: number,
  count: number,
  run: (random: Random, index: number) => void,
): void {
  const random = createRandom(seed);
  for (let index = 0; index < count; index += 1) {
    try {
      run(random, index);
    } catch (cause) {
      throw new Error(`テストケース ${index} が失敗しました (seed: ${seed})`, { cause });
    }
  }
}

/**
 * forCases の非同期版です。各ケースの完了を待ってから次のケースを実行します。
 */
export async function forCasesAsync(
  seed: number,
  count: number,
  run: (random: Random, index: number) => Promise<void>,
): Promise<void> {
  const random = createRandom(seed);
  for (let index = 0; index < count; index += 1) {
    try {
      await run(random, index);
    } catch (cause) {
      throw new Error(`テストケース ${index} が失敗しました (seed: ${seed})`, { cause });
    }
  }
}
