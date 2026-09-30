import { describe, test } from "vitest";

import toReadableStream from "../src/to-readable-stream.js";
import { forCasesAsync } from "./_random.js";

/**
 * ストリームからすべての値を読み取り、配列として返します。
 */
async function collectFromStream<T>(stream: ReadableStream<T>): Promise<T[]> {
  const reader = stream.getReader();
  const values: T[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    values.push(value);
  }
  return values;
}

/**
 * ReadableStream.from を一時的に削除して処理を実行し、終了後に元へ戻します。
 * ReadableStream.from が存在しない環境でのポリフィル経路を検証するために使用します。
 */
async function withoutReadableStreamFrom<T>(fn: () => T | Promise<T>): Promise<T> {
  const descriptor = Object.getOwnPropertyDescriptor(ReadableStream, "from");
  delete (ReadableStream as { from?: unknown }).from;

  try {
    return await fn();
  } finally {
    if (descriptor === undefined) {
      delete (ReadableStream as { from?: unknown }).from;
    } else {
      Object.defineProperty(ReadableStream, "from", descriptor);
    }
  }
}

describe("toReadableStream", () => {
  test("ReadableStream のインスタンスを返す", ({ expect }) => {
    // 実行
    const stream = toReadableStream([1]);

    // 検証
    expect(stream).toBeInstanceOf(ReadableStream);
    expect(stream.locked).toBe(false);
  });

  test("1 つの要素だけのイテラブルを変換する", async ({ expect }) => {
    // 実行
    const stream = toReadableStream([42]);

    // 検証
    expect(await collectFromStream(stream)).toStrictEqual([42]);
  });

  test("複数の要素を順番どおりに配信する", async ({ expect }) => {
    // 準備
    const values = [{ id: 1 }, { id: 2 }, { id: 3 }];

    // 実行
    const stream = toReadableStream(values);

    // 検証
    expect(await collectFromStream(stream)).toStrictEqual(values);
  });

  test("要素の参照をそのまま配信する", async ({ expect }) => {
    // 準備
    const value = { id: 1 };

    // 実行
    const stream = toReadableStream([value]);
    const [received] = await collectFromStream(stream);

    // 検証
    expect(received).toBe(value);
  });

  test("ジェネレーターを変換する", async ({ expect }) => {
    // 準備
    function* generate() {
      yield 1;
      yield 2;
    }

    // 実行
    const stream = toReadableStream(generate());

    // 検証
    expect(await collectFromStream(stream)).toStrictEqual([1, 2]);
  });

  test("ReadableStream.from がない環境でも変換できる", async ({ expect }) => {
    // 準備と実行
    const values = await withoutReadableStreamFrom(async () => {
      const stream = toReadableStream([1, 2, 3]);
      const result = await collectFromStream(stream);

      // 検証: ポリフィルが後始末されている
      expect("from" in ReadableStream).toBe(false);
      return result;
    });

    // 検証
    expect(values).toStrictEqual([1, 2, 3]);
  });

  test("ReadableStream.from がない環境でキャンセルするとジェネレーターが閉じる", async ({
    expect,
  }) => {
    // 準備
    let closed = false;
    function* generate() {
      try {
        yield 1;
        yield 2;
      } finally {
        closed = true;
      }
    }

    // 実行
    await withoutReadableStreamFrom(async () => {
      const stream = toReadableStream(generate());
      const reader = stream.getReader();
      await reader.read();
      await reader.cancel();
    });

    // 検証
    expect(closed).toBe(true);
  });

  test("任意の数値配列を順序を保って配信する (決定的ファズ)", async ({ expect }) => {
    await forCasesAsync(20260930, 50, async (random) => {
      // 準備
      const values = random.array(random.uint(50), () => random.int(-2_147_483_648, 2_147_483_647));

      // 実行
      const stream = toReadableStream(values);

      // 検証
      expect(await collectFromStream(stream)).toStrictEqual(values);
    });
  });
});
