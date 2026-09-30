/**
 * mulberry32 を基にした決定的な疑似乱数生成器が提供する操作です。
 * 外部依存なしで入力列を再現するために使用します。
 */
export type Random = {
  /** 0 以上 1 未満の値を返します。 */
  next(): number;

  /** min 以上 max 以下の整数を返します。 */
  int(min: number, max: number): number;

  /** 0 以上 max 未満の整数を返します。max を省略した場合は 0 以上 2^32 未満です。 */
  uint(max?: number): number;

  /** 真偽値を返します。 */
  bool(): boolean;

  /** 配列から 1 要素を選んで返します。 */
  pick<T>(items: readonly T[]): T;

  /** 長さ length のランダムなバイト列を返します。 */
  bytes(length: number): Uint8Array<ArrayBuffer>;

  /** 文字集合 chars から選んだ文字を length 個連結した文字列を返します。 */
  string(length: number, chars?: readonly string[]): string;

  /** generate を length 回呼び出した結果の配列を返します。 */
  array<T>(length: number, generate: (random: Random, index: number) => T): T[];

  /** 要素を Fisher-Yates 法で並べ替えた新しい配列を返します。 */
  shuffle<T>(items: readonly T[]): T[];
};

const DEFAULT_CHARS = Array.from(
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_",
);

/**
 * seed から決定的な疑似乱数生成器を作成します。
 * 同じ seed と同じ呼び出し列に対して常に同じ値を返します。
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

  const random: Random = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    uint: (max) =>
      max === undefined ? Math.floor(next() * 0x100000000) : Math.floor(next() * max),
    bool: () => next() < 0.5,
    pick: (items) => {
      if (items.length === 0) {
        throw new Error("pick の対象配列が空です");
      }

      return items[random.int(0, items.length - 1)]!;
    },
    bytes: (length) => {
      const bytes = new Uint8Array(length);

      for (let index = 0; index < length; index++) {
        bytes[index] = random.uint(256);
      }

      return bytes;
    },
    string: (length, chars = DEFAULT_CHARS) => {
      let result = "";

      for (let index = 0; index < length; index++) {
        result += random.pick(chars);
      }

      return result;
    },
    array: (length, generate) => Array.from({ length }, (_, index) => generate(random, index)),
    shuffle: (items) => {
      const result = [...items];

      for (let index = result.length - 1; index > 0; index--) {
        const target = random.int(0, index);
        [result[index], result[target]] = [result[target]!, result[index]!];
      }

      return result;
    },
  };

  return random;
}

/**
 * seed から count 回ケースを実行します。
 * 失敗したケースの番号と seed をメッセージに含め、元の例外を cause に保持して投げます。
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
 * seed から count 回非同期ケースを実行します。
 * 失敗したケースの番号と seed をメッセージに含め、元の例外を cause に保持して投げます。
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
