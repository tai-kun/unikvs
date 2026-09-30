/**
 * 決定的な PRNG のインターフェースです。
 * 外部のプロパティテストライブラリに依存せず、固定 seed で再現可能なファズテストを行うために使用します。
 */
export interface Random {
  /**
   * 0 以上 1 未満の疑似乱数を返します。
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
   * 配列から 1 つの要素を返します。
   */
  pick<T>(items: readonly T[]): T;

  /**
   * 指定した長さのバイト列を返します。
   */
  bytes(length: number): Uint8Array;

  /**
   * サロゲートペアを含みうる UTF-16 コード単位の文字列を返します。
   */
  string(length: number): string;

  /**
   * 指定した長さの配列を生成関数から作成して返します。
   */
  array<T>(length: number, create: (random: Random, index: number) => T): T[];

  /**
   * 要素をシャッフルした新しい配列を返します。
   */
  shuffle<T>(items: readonly T[]): T[];
}

/**
 * mulberry32 による決定的な PRNG を作成します。
 * 同じ seed からは常に同じ疑似乱数列が得られ、ファズテストの失敗を再現するために使用します。
 */
export function createRandom(seed: number): Random {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  };

  const random: Random = {
    next,
    int(min, max) {
      return Math.floor(next() * (max - min + 1)) + min;
    },
    uint(max = 0xffff_ffff) {
      return Math.floor(next() * (max + 1));
    },
    bool() {
      return next() < 0.5;
    },
    pick(items) {
      return items[Math.floor(next() * items.length)]!;
    },
    bytes(length) {
      const bytes = new Uint8Array(length);
      for (let index = 0; index < length; index++) {
        bytes[index] = Math.floor(next() * 0x100);
      }
      return bytes;
    },
    string(length) {
      let text = "";
      for (let index = 0; index < length; index++) {
        text += String.fromCharCode(Math.floor(next() * 0x1_0000));
      }
      return text;
    },
    array(length, create) {
      return Array.from({ length }, (_, index) => create(random, index));
    },
    shuffle(items) {
      const copy = [...items];
      for (let index = copy.length - 1; index > 0; index--) {
        const target = Math.floor(next() * (index + 1));
        const value = copy[index]!;
        copy[index] = copy[target]!;
        copy[target] = value;
      }
      return copy;
    },
  };

  return random;
}

/**
 * count 回ケースを処理し、失敗時は seed とケース番号を付けたエラーを投げます。
 * ケースごとに seed + index の乱数列を使うため、失敗したケースを単独で再現するために使用します。
 */
export function forCases(
  seed: number,
  count: number,
  fn: (random: Random, index: number) => void,
): void {
  for (let index = 0; index < count; index++) {
    const random = createRandom(seed + index);
    try {
      fn(random, index);
    } catch (error) {
      throw new Error(`ケースに失敗しました: seed=${seed}, index=${index}`, { cause: error });
    }
  }
}

/**
 * count 回ケースを順に処理する非同期版です。
 * ストリームなど await を伴うファズテストで使用します。
 */
export async function forCasesAsync(
  seed: number,
  count: number,
  fn: (random: Random, index: number) => Promise<void>,
): Promise<void> {
  for (let index = 0; index < count; index++) {
    const random = createRandom(seed + index);
    try {
      await fn(random, index);
    } catch (error) {
      throw new Error(`ケースに失敗しました: seed=${seed}, index=${index}`, { cause: error });
    }
  }
}
