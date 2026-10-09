/**
 * 決定的な擬似乱数生成器 (mulberry32) です。
 * 同じ seed からは常に同じ値の列を生成するため、再現可能なファズテストに使用します。
 */
export type Random = {
  /** 0 以上 1 未満の実数を返します。 */
  next(): number;

  /** min 以上 max 以下の整数を返します。 */
  int(min: number, max: number): number;

  /** 0 以上 max 以下の整数を返します。max を省略すると 32 ビット符号なし整数の範囲になります。 */
  uint(max?: number): number;

  /** 配列から等確率で 1 件選んで返します。 */
  pick<T>(items: readonly T[]): T;

  /** 指定した長さのランダムなバイト列を返します。 */
  bytes(length: number): Uint8Array<ArrayBuffer>;

  /** 指定した長さの配列を生成関数から作成します。 */
  array<T>(length: number, generate: (random: Random, index: number) => T): T[];
};

/**
 * seed から決定的な Random を生成します。
 * 実行環境や実行タイミングによらず同じ値の列を生成し、ファズテストの再現性を保つために使用します。
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
    int(min, max) {
      if (max < min) {
        throw new RangeError(`max (${max}) は min (${min}) 以上である必要があります。`);
      }

      return min + Math.floor(next() * (max - min + 1));
    },
    uint(max = 0xffffffff) {
      return random.int(0, max);
    },
    pick(items) {
      if (items.length === 0) {
        throw new RangeError("空の配列から要素を選ぶことはできません。");
      }

      return items[random.int(0, items.length - 1)]!;
    },
    bytes(length) {
      const result = new Uint8Array(length);

      for (let index = 0; index < length; index++) {
        result[index] = random.uint(255);
      }

      return result;
    },
    array(length, generate) {
      return Array.from({ length }, (_, index) => generate(random, index));
    },
  };

  return random;
}

/**
 * 固定 seed の Random をケース間で共有しながら count 回コールバックを実行します。
 * 失敗時は seed とケース番号を message に含み、元の例外を cause に持つ Error を投げて再現を容易にします。
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
      throw new Error(`ファズテストのケースが失敗しました (seed=${seed}, index=${index})`, {
        cause: error,
      });
    }
  }
}

/**
 * forCases の非同期版です。
 * 非同期処理を含むケースを実行するために使用します。
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
      throw new Error(`ファズテストのケースが失敗しました (seed=${seed}, index=${index})`, {
        cause: error,
      });
    }
  }
}
