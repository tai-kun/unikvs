/**
 * 決定的なファズテストで使用する疑似乱数生成器の契約です。
 * 固定 seed から再現可能な入力列を生成するために使用します。
 */
export type Random = {
  /**
   * [0, 1) の乱数を返します。
   */
  next(): number;

  /**
   * min と max を含む範囲の整数を返します。
   */
  int(min: number, max: number): number;

  /**
   * [0, max) の整数を返します。
   */
  uint(max: number): number;

  /**
   * 真偽値を返します。
   */
  bool(): boolean;

  /**
   * 配列から 1 要素を選びます。配列が空の場合は例外を投げます。
   */
  pick<T>(items: readonly T[]): T;

  /**
   * 指定長のランダムなバイト列を返します。
   */
  bytes(length: number): Uint8Array;

  /**
   * 指定長のランダムな文字列を返します。サロゲート単体を含むことがあります。
   */
  string(length: number): string;
};

/**
 * mulberry32 による決定的な疑似乱数生成器を生成します。
 * 外部依存なしで seed を固定したファズテストを書くために使用します。
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

  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));

  const uint = (max: number): number => Math.floor(next() * max);

  return {
    next,
    int,
    uint,
    bool: () => next() < 0.5,
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) {
        throw new Error("pick の対象配列が空です。");
      }
      return items[uint(items.length)]!;
    },
    bytes(length: number): Uint8Array {
      const result = new Uint8Array(length);
      for (let index = 0; index < length; index++) {
        result[index] = int(0, 255);
      }
      return result;
    },
    string(length: number): string {
      let result = "";
      for (let index = 0; index < length; index++) {
        result += String.fromCharCode(int(1, 0xffff));
      }
      return result;
    },
  };
}

/**
 * seed から生成した乱数を使い、count 回ケースを実行します。
 * 失敗した場合は seed とケース番号を含む Error を cause 付きで投げ、再現を容易にします。
 */
export function forCases(
  seed: number,
  count: number,
  fn: (random: Random, index: number) => void,
): void {
  const random = createRandom(seed);
  for (let index = 0; index < count; index++) {
    try {
      fn(random, index);
    } catch (error) {
      throw new Error(`seed=${seed} のケース ${index} が失敗しました。`, { cause: error });
    }
  }
}

/**
 * forCases の非同期版です。コールバックの完了を待ってから次のケースへ進みます。
 */
export async function forCasesAsync(
  seed: number,
  count: number,
  fn: (random: Random, index: number) => Promise<void> | void,
): Promise<void> {
  const random = createRandom(seed);
  for (let index = 0; index < count; index++) {
    try {
      await fn(random, index);
    } catch (error) {
      throw new Error(`seed=${seed} のケース ${index} が失敗しました。`, { cause: error });
    }
  }
}
