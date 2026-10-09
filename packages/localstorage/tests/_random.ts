/**
 * 決定的な PRNG とケース実行ユーティリティーです。
 *
 * 外部依存なしで固定 seed から再現可能なランダム入力を生成し、
 * プロパティー風のテストを決定的に実行するために使用します。
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
   * 真偽値を返します。
   */
  bool(): boolean;

  /**
   * 配列から 1 要素を選んで返します。
   */
  pick<T>(items: readonly T[]): T;

  /**
   * 指定した長さのバイト列を返します。
   */
  bytes(length: number): Uint8Array<ArrayBuffer>;

  /**
   * 指定した長さの文字列を返します。サロゲートペアを含む場合があります。
   */
  string(length: number): string;

  /**
   * length 回 gen を呼び出して作った配列を返します。
   */
  array<T>(length: number, gen: () => T): T[];

  /**
   * 要素を複製してシャッフルした配列を返します。
   */
  shuffle<T>(items: readonly T[]): T[];
};

const keyAlphabet = [
  "a",
  "b",
  "c",
  "x",
  "y",
  "z",
  "A",
  "B",
  "Z",
  "0",
  "1",
  "9",
  "_",
  "-",
  "/",
  " ",
  ".",
  "あ",
  "い",
  "ん",
  "é",
  "🔑",
] as const;

/**
 * mulberry32 による決定的な乱数生成器を返します。
 */
function createNext(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * seed から決定的な Random を生成します。
 * 同じ seed と同じ呼び出し順に対して常に同じ値を返します。
 */
export function createRandom(seed: number): Random {
  const next = createNext(seed);

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
      const bytes = new Uint8Array(length);

      for (let i = 0; i < length; i += 1) {
        bytes[i] = random.uint(255);
      }

      return bytes;
    },

    string(length) {
      let result = "";

      for (let i = 0; i < length; i += 1) {
        result += random.pick(keyAlphabet);
      }

      return result;
    },

    array<T>(length: number, gen: () => T): T[] {
      const values: T[] = [];

      for (let i = 0; i < length; i += 1) {
        values.push(gen());
      }

      return values;
    },

    shuffle(items) {
      const result = [...items];

      for (let i = result.length - 1; i > 0; i -= 1) {
        const j = random.uint(i);
        const value = result[i]!;
        result[i] = result[j]!;
        result[j] = value;
      }

      return result;
    },
  };

  return random;
}

/**
 * seed とケース index から再現可能な派生 seed を作ります。
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
  fn: (random: Random, index: number) => void,
): void {
  for (let index = 0; index < count; index += 1) {
    try {
      fn(createRandom(deriveSeed(seed, index)), index);
    } catch (error) {
      throw new Error(`ケースが失敗しました (seed: ${seed}, case: ${index})`, { cause: error });
    }
  }
}

/**
 * forCases の非同期版です。
 */
export async function forCasesAsync(
  seed: number,
  count: number,
  fn: (random: Random, index: number) => Promise<void>,
): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    try {
      await fn(createRandom(deriveSeed(seed, index)), index);
    } catch (error) {
      throw new Error(`ケースが失敗しました (seed: ${seed}, case: ${index})`, { cause: error });
    }
  }
}
