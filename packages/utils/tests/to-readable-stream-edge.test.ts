import { readAll, forCasesAsync } from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import toReadableStream from "../src/to-readable-stream.js";
import { withoutReadableStreamFrom } from "./helpers.js";

describe("toReadableStream", () => {
  test("ReadableStream のインスタンスを返す", ({ expect }) => {
    // 実行：
    const stream = toReadableStream([1]);

    // 検証：
    expect(stream).toBeInstanceOf(ReadableStream);
    expect(stream.locked).toBe(false);
  });

  test("1 つの要素だけのイテラブルを変換する", async ({ expect }) => {
    // 実行：
    const stream = toReadableStream([42]);

    // 検証：
    expect(await readAll(stream)).toStrictEqual([42]);
  });

  test("複数の要素を順番どおりに配信する", async ({ expect }) => {
    // 準備：
    const values = [{ id: 1 }, { id: 2 }, { id: 3 }];

    // 実行：
    const stream = toReadableStream(values);

    // 検証：
    expect(await readAll(stream)).toStrictEqual(values);
  });

  test("要素の参照をそのまま配信する", async ({ expect }) => {
    // 準備：
    const value = { id: 1 };

    // 実行：
    const stream = toReadableStream([value]);
    const [received] = await readAll(stream);

    // 検証：
    expect(received).toBe(value);
  });

  test("ジェネレーターを変換する", async ({ expect }) => {
    // 準備：
    // oxlint-disable-next-line unicorn/consistent-function-scoping
    function* generate(): Generator<unknown, void, unknown> {
      yield 1;
      yield 2;
    }

    // 実行：
    const stream = toReadableStream(generate());

    // 検証：
    expect(await readAll(stream)).toStrictEqual([1, 2]);
  });

  test("ReadableStream.from がない環境でも変換できる", async ({ expect }) => {
    // 準備：と実行。
    const values = await withoutReadableStreamFrom(async () => {
      const stream = toReadableStream([1, 2, 3]);
      const result = await readAll(stream);

      // 検証 : ポリフィルが後始末されている。
      expect("from" in ReadableStream).toBe(false);

      return result;
    });

    // 検証：
    expect(values).toStrictEqual([1, 2, 3]);
  });

  test("ReadableStream.from がない環境でキャンセルするとジェネレーターが閉じる", async ({
    expect,
  }) => {
    // 準備：
    let closed = false;

    function* generate(): Generator<unknown, void, unknown> {
      try {
        yield 1;
        yield 2;
      } finally {
        closed = true;
      }
    }

    // 実行：
    await withoutReadableStreamFrom(async () => {
      const stream = toReadableStream(generate());
      const reader = stream.getReader();
      await reader.read();
      await reader.cancel();
    });

    // 検証：
    expect(closed).toBe(true);
  });

  test("任意の数値配列を順序を保って配信する (決定的ファズ)", async ({ expect }) => {
    await forCasesAsync(20_260_930, 50, async (random) => {
      // 準備：
      const values = random.array(random.uint(50), () => random.int(-2_147_483_648, 2_147_483_647));

      // 実行：
      const stream = toReadableStream(values);

      // 検証：
      expect(await readAll(stream)).toStrictEqual(values);
    });
  });
});
