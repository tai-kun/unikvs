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
   * 0 以上 max 以下の整数を返します。
   *
   * @default 0xffffffff
   */
  uint(max?: number): number;

  /**
   * 真偽値を返します。
   */
  bool(): boolean;

  /**
   * 配列から 1 要素を選んで返します。
   */
  pick<T>(items: readonly T[]): T;

  /**
   * 指定した長さのランダムなバイト列を返します。
   */
  bytes(length: number): Uint8Array<ArrayBuffer>;

  /**
   * 指定した長さの文字列を返します。
   * alphabet を省略すると英小文字と数字になります。
   */
  string(length: number, alphabet?: string | readonly string[]): string;

  /**
   * generate を length 回呼び出して作った配列を返します。
   */
  array<T>(length: number, generate: (random: Random, index: number) => T): T[];

  /**
   * 要素を複製してシャッフルした配列を返します。
   */
  shuffle<T>(items: readonly T[]): T[];
};

const DEFAULT_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/**
 * mulberry32 による決定的な擬似乱数生成器を作成します。
 * 同じ seed と同じ呼び出し順に対して常に同じ値を返すため、失敗を再現可能にするために使用します。
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

  const random: Random = {
    next,

    int(min, max) {
      if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
        throw new RangeError(`int の範囲が不正です: ${min}..${max}`);
      }

      return min + Math.floor(next() * (max - min + 1));
    },

    uint(max = 0xffffffff) {
      if (!Number.isInteger(max) || max < 0) {
        throw new RangeError(`uint の最大値が不正です: ${max}`);
      }

      return Math.floor(next() * (max + 1));
    },

    bool() {
      return next() < 0.5;
    },

    pick(items) {
      if (items.length === 0) {
        throw new RangeError("空の配列からは選べません");
      }

      return items[Math.floor(next() * items.length)]!;
    },

    bytes(length) {
      const result = new Uint8Array(length);

      for (let index = 0; index < length; index++) {
        result[index] = Math.floor(next() * 256);
      }

      return result;
    },

    string(length, alphabet = DEFAULT_ALPHABET) {
      const chars = typeof alphabet === "string" ? Array.from(alphabet) : alphabet;

      if (chars.length === 0) {
        throw new RangeError("空の文字集合からは文字列を作れません");
      }

      let result = "";

      for (let index = 0; index < length; index++) {
        result += chars[Math.floor(next() * chars.length)]!;
      }

      return result;
    },

    array(length, generate) {
      return Array.from({ length }, (_, index) => generate(random, index));
    },

    shuffle(items) {
      const result = [...items];

      for (let index = result.length - 1; index > 0; index--) {
        const target = Math.floor(next() * (index + 1));
        const value = result[index]!;
        result[index] = result[target]!;
        result[target] = value;
      }

      return result;
    },
  };

  return random;
}

/**
 * seed とケース番号から再現可能な派生 seed を作ります。
 */
function deriveSeed(seed: number, index: number): number {
  return (seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0;
}

/**
 * 同じ seed から派生した乱数を使い、count 回テスト本体を実行します。
 * 失敗したケースの seed と index をメッセージに含め、元の例外を cause に保持します。
 */
export function forCases(
  seed: number,
  count: number,
  run: (random: Random, index: number) => void,
): void {
  for (let index = 0; index < count; index++) {
    try {
      run(createRandom(deriveSeed(seed, index)), index);
    } catch (error) {
      throw new Error(`ケースが失敗しました (seed: ${seed}, index: ${index})`, { cause: error });
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
  run: (random: Random, index: number) => Promise<void> | void,
): Promise<void> {
  for (let index = 0; index < count; index++) {
    try {
      await run(createRandom(deriveSeed(seed, index)), index);
    } catch (error) {
      throw new Error(`ケースが失敗しました (seed: ${seed}, index: ${index})`, { cause: error });
    }
  }
}
