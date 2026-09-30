/**
 * 決定的なファズテスト用の乱数生成器です。
 *
 * 外部依存を持たず、同じ seed からは常に同じ系列を生成します。
 */
export type Random = {
  /**
   * [0, 1) の浮動小数点数を返します。
   */
  next(): number;

  /**
   * min 以上 max 以下の整数を返します。
   */
  int(min: number, max: number): number;

  /**
   * max 未満の符号なし整数を返します。max を省略すると 32 ビット符号なし整数を返します。
   */
  uint(max?: number): number;

  /**
   * 真偽値を返します。
   */
  bool(): boolean;

  /**
   * 配列から 1 つの要素を返します。空配列は指定できません。
   */
  pick<T>(items: readonly T[]): T;

  /**
   * 指定長のランダムなバイト列を返します。
   */
  bytes(length: number): Uint8Array<ArrayBuffer>;

  /**
   * 指定長のランダムな ASCII 文字列を返します。
   */
  string(length: number): string;

  /**
   * length 回 gen を呼び出して配列を生成します。
   */
  array<T>(length: number, gen: (rng: Random) => T): T[];

  /**
   * 元の配列を変更せずにシャッフルした新しい配列を返します。
   */
  shuffle<T>(items: readonly T[]): T[];
};

/**
 * mulberry32 による決定的な PRNG を生成します。
 *
 * @param seed 乱数系列の種です。同じ seed からは常に同じ系列が得られます。
 * @returns 決定的な乱数生成器を返します。
 */
export function createRandom(seed: number): Random {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const rng: Random = {
    next,

    int(min: number, max: number): number {
      if (max < min) {
        throw new Error(`int: max (${max}) must be >= min (${min})`);
      }

      return min + Math.floor(next() * (max - min + 1));
    },

    uint(max?: number): number {
      if (max === undefined) {
        return Math.floor(next() * 4294967296) >>> 0;
      }

      return rng.int(0, max - 1);
    },

    bool(): boolean {
      return next() < 0.5;
    },

    pick<T>(items: readonly T[]): T {
      if (items.length === 0) {
        throw new Error("pick: items must not be empty");
      }

      return items[Math.floor(next() * items.length)]!;
    },

    bytes(length: number): Uint8Array<ArrayBuffer> {
      const out = new Uint8Array(new ArrayBuffer(length));
      for (let i = 0; i < length; i++) {
        out[i] = rng.uint(256);
      }

      return out;
    },

    string(length: number): string {
      const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -_";
      let out = "";
      for (let i = 0; i < length; i++) {
        out += alphabet[rng.int(0, alphabet.length - 1)]!;
      }

      return out;
    },

    array<T>(length: number, gen: (r: Random) => T): T[] {
      return Array.from({ length }, () => gen(rng));
    },

    shuffle<T>(items: readonly T[]): T[] {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = rng.int(0, i);
        [out[i], out[j]] = [out[j]!, out[i]!];
      }

      return out;
    },
  };

  return rng;
}

/**
 * seed から派生したケース seed で count 回テスト関数を実行します。
 *
 * 失敗したケースでは、seed と case index を含む Error を cause に元の例外を設定して投げます。
 *
 * @param seed ケース seed の基準値です。
 * @param count 実行するケース数です。
 * @param fn 各ケースで実行する関数です。第 2 引数には 0 始まりのケース番号が渡されます。
 */
export function forCases(
  seed: number,
  count: number,
  fn: (rng: Random, index: number) => void,
): void {
  for (let index = 0; index < count; index++) {
    const caseSeed = seed + index;
    try {
      fn(createRandom(caseSeed), index);
    } catch (cause) {
      throw new Error(`fuzz case ${index} failed (seed=${seed}, caseSeed=${caseSeed})`, { cause });
    }
  }
}

/**
 * forCases の非同期版です。各ケースを順番に await して実行します。
 *
 * @param seed ケース seed の基準値です。
 * @param count 実行するケース数です。
 * @param fn 各ケースで実行する非同期関数です。第 2 引数には 0 始まりのケース番号が渡されます。
 */
export async function forCasesAsync(
  seed: number,
  count: number,
  fn: (rng: Random, index: number) => Promise<void>,
): Promise<void> {
  for (let index = 0; index < count; index++) {
    const caseSeed = seed + index;
    try {
      await fn(createRandom(caseSeed), index);
    } catch (cause) {
      throw new Error(`fuzz case ${index} failed (seed=${seed}, caseSeed=${caseSeed})`, { cause });
    }
  }
}
