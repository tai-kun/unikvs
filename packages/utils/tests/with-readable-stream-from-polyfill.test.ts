import { describe, test } from "vitest";

import withReadableStreamFrom from "../src/with-readable-stream-from.js";

const hasNativeFrom = typeof (ReadableStream as { from?: unknown }).from === "function";

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

describe("withReadableStreamFrom", () => {
  test.skipIf(!hasNativeFrom)(
    "ReadableStream.from が存在する環境ではポリフィルを追加せずに実行する",
    ({ expect }) => {
      // 準備
      const originalFrom = (ReadableStream as { from?: unknown }).from;

      // 実行
      const result = withReadableStreamFrom((RS) => {
        expect(RS).toBe(ReadableStream);
        expect((ReadableStream as { from?: unknown }).from).toBe(originalFrom);
        return "result";
      });

      // 検証
      expect(result).toBe("result");
      expect((ReadableStream as { from?: unknown }).from).toBe(originalFrom);
    },
  );

  test("コールバックの戻り値をそのまま返す", ({ expect }) => {
    // 実行と検証
    expect(withReadableStreamFrom(() => 7)).toBe(7);
  });

  test("ポリフィル環境でもコールバックの戻り値を返す", async ({ expect }) => {
    // 準備
    const result = await withoutReadableStreamFrom(() => withReadableStreamFrom(() => "value"));

    // 検証
    expect(result).toBe("value");
  });

  test("ポリフィル環境ではコールバック実行中だけ from が存在する", async ({ expect }) => {
    // 準備
    let sawPolyfill = false;
    let sawFromAfter = false;

    // 実行
    await withoutReadableStreamFrom(() => {
      withReadableStreamFrom((RS) => {
        sawPolyfill = typeof RS.from === "function";
      });
      sawFromAfter = "from" in ReadableStream;
    });

    // 検証
    expect(sawPolyfill).toBe(true);
    expect(sawFromAfter).toBe(false);
  });

  test("コールバックが例外を投げてもポリフィルを後始末する", async ({ expect }) => {
    // 準備と実行
    let caught: unknown;
    await withoutReadableStreamFrom(() => {
      try {
        withReadableStreamFrom(() => {
          throw new Error("boom");
        });
      } catch (error) {
        caught = error;
      }

      // 検証
      expect("from" in ReadableStream).toBe(false);
    });

    // 検証
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("boom");
  });

  test("入れ子で呼び出しても外側のポリフィルを共有する", async ({ expect }) => {
    // 準備
    let innerSawPolyfill = false;

    // 実行と検証
    await withoutReadableStreamFrom(async () => {
      const { first, second } = withReadableStreamFrom((RS) => ({
        first: RS.from([1]),
        second: withReadableStreamFrom((InnerRS) => {
          innerSawPolyfill = typeof InnerRS.from === "function";
          return InnerRS.from(["x"]);
        }),
      }));

      expect(innerSawPolyfill).toBe(true);
      expect(await collectFromStream(first)).toStrictEqual([1]);
      expect(await collectFromStream(second)).toStrictEqual(["x"]);
      expect("from" in ReadableStream).toBe(false);
    });
  });

  test("ポリフィルでキャンセルすると iterator.return が理由付きで呼ばれる", async ({ expect }) => {
    // 準備
    const returnReasons: unknown[] = [];
    const iterable: Iterable<number> = {
      [Symbol.iterator]() {
        return {
          next: () => ({ done: false, value: 1 }),
          return: (reason?: unknown) => {
            returnReasons.push(reason);
            return { done: true, value: undefined };
          },
        };
      },
    };

    // 実行
    await withoutReadableStreamFrom(async () => {
      const stream = withReadableStreamFrom((RS) => RS.from(iterable));
      const reader = stream.getReader();
      await reader.read();
      await reader.cancel("stop");
    });

    // 検証
    expect(returnReasons).toStrictEqual(["stop"]);
  });

  test("読み取り前にキャンセルしても iterator.return が呼ばれる", async ({ expect }) => {
    // 準備
    let returned = false;
    const iterable: Iterable<number> = {
      [Symbol.iterator]() {
        return {
          next: () => ({ done: false, value: 1 }),
          return: () => {
            returned = true;
            return { done: true, value: undefined };
          },
        };
      },
    };

    // 実行
    await withoutReadableStreamFrom(async () => {
      const stream = withReadableStreamFrom((RS) => RS.from(iterable));
      await stream.cancel();
    });

    // 検証
    expect(returned).toBe(true);
  });

  test("iterator.return が投げてもキャンセルは完了する", async ({ expect }) => {
    // 準備
    const iterable: Iterable<number> = {
      [Symbol.iterator]() {
        return {
          next: () => ({ done: false, value: 1 }),
          return: () => {
            throw new Error("cleanup failed");
          },
        };
      },
    };

    // 実行と検証
    await withoutReadableStreamFrom(async () => {
      const stream = withReadableStreamFrom((RS) => RS.from(iterable));
      const reader = stream.getReader();
      await reader.read();

      await expect(reader.cancel()).resolves.toBeUndefined();
    });
  });

  test("ポリフィルで同期イテレーターの next が投げるとストリームがエラーになる", async ({
    expect,
  }) => {
    // 準備
    const iterable: Iterable<number> = {
      [Symbol.iterator]() {
        return {
          next() {
            throw new Error("next failed");
          },
        };
      },
    };

    // 実行と検証
    await withoutReadableStreamFrom(async () => {
      const stream = withReadableStreamFrom((RS) => RS.from(iterable));

      await expect(stream.getReader().read()).rejects.toThrow("next failed");
    });
  });

  test("ポリフィルで空のイテラブルは空のストリームになる", async ({ expect }) => {
    // 準備と実行
    const values = await withoutReadableStreamFrom(async () => {
      const stream = withReadableStreamFrom((RS) => RS.from([]));
      return collectFromStream(stream);
    });

    // 検証
    expect(values).toStrictEqual([]);
  });
});
