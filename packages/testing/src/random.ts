// oxlint-disable unicorn/number-literal-case
/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#random)
 */
export type Random = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#random-next)
   */
  next(): number;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#random-int)
   */
  int(min: number, max: number): number;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#random-uint)
   */
  uint(max?: number): number;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#random-bool)
   */
  bool(): boolean;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#random-pick)
   */
  pick<T>(items: readonly T[]): T;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#random-bytes)
   */
  bytes(length: number): Uint8Array<ArrayBuffer>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#random-string)
   */
  string(length: number, alphabet?: string | readonly string[]): string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#random-array)
   */
  array<T>(length: number, generate: (random: Random, index: number) => T): T[];

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#random-shuffle)
   */
  shuffle<T>(items: readonly T[]): T[];
};

/**
 * 文字列生成で使う既定の文字集合です。
 *
 * 英小文字と数字からなります。
 */
const DEFAULT_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#create-random)
 */
export function createRandom(seed: number): Random {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };

  const random: Random = {
    next,

    int(min, max) {
      if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
        throw new RangeError(`int の範囲が不正です: ${min}..${max}`);
      }

      return min + Math.floor(next() * (max - min + 1));
    },

    uint(max = 0xff_ff_ff_ff) {
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

      const picked = items[Math.floor(next() * items.length)];

      if (picked === undefined) {
        throw new RangeError("空の配列からは選べません");
      }

      return picked;
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
        const char = chars[Math.floor(next() * chars.length)];

        if (char === undefined) {
          throw new RangeError("空の文字集合からは文字列を作れません");
        }

        result += char;
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
        const value = result[index];
        const targetValue = result[target];

        if (value === undefined || targetValue === undefined) {
          throw new RangeError("シャッフル中のインデックスが不正です");
        }

        result[index] = targetValue;
        result[target] = value;
      }

      return result;
    },
  };

  return random;
}

/**
 * seed とケース番号から再現可能な派生 seed を作ります。
 *
 * @param seed 元になる種です。
 * @param index ケース番号です。
 *
 * @returns 派生した種です。
 */
function deriveSeed(seed: number, index: number): number {
  return (seed ^ Math.imul(index + 1, 0x9e_37_79_b9)) >>> 0;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#for-cases)
 */
export function forCases(
  seed: number,
  count: number,
  run: (random: Random, index: number) => void,
): void {
  for (let index = 0; index < count; index++) {
    try {
      run(createRandom(deriveSeed(seed, index)), index);
    } catch (ex) {
      throw new Error(`ケースが失敗しました (seed: ${seed}, index: ${index})`, { cause: ex });
    }
  }
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#for-cases-async)
 */
export async function forCasesAsync(
  seed: number,
  count: number,
  run: (random: Random, index: number) => Promise<void> | void,
): Promise<void> {
  for (let index = 0; index < count; index++) {
    try {
      await run(createRandom(deriveSeed(seed, index)), index);
    } catch (ex) {
      throw new Error(`ケースが失敗しました (seed: ${seed}, index: ${index})`, { cause: ex });
    }
  }
}
