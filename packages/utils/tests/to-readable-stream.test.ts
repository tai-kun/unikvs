import { describe, test } from "vitest";

import toReadableStream from "../src/to-readable-stream.js";

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

describe("toReadableStream", () => {
  test("同期イテラブルを ReadableStream に変換する", async ({ expect }) => {
    // 実行
    const stream = toReadableStream([1, 2, 3]);

    // 検証
    const values = await collectFromStream(stream);
    expect(values).toEqual([1, 2, 3]);
  });

  test("非同期イテラブルを ReadableStream に変換する", async ({ expect }) => {
    // 準備
    async function* asyncGen() {
      yield 1;
      yield 2;
      yield 3;
    }

    // 実行
    const stream = toReadableStream(asyncGen());

    // 検証
    const values = await collectFromStream(stream);
    expect(values).toEqual([1, 2, 3]);
  });

  test("空のイテラブルを ReadableStream に変換する", async ({ expect }) => {
    // 実行
    const stream = toReadableStream([]);

    // 検証
    const values = await collectFromStream(stream);
    expect(values).toEqual([]);
  });

  test("文字列のイテラブルを ReadableStream に変換する", async ({ expect }) => {
    // 実行
    const stream = toReadableStream("abc");

    // 検証
    const values = await collectFromStream(stream);
    expect(values).toEqual(["a", "b", "c"]);
  });
});
