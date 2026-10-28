import { readAll } from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import toReadableStream from "../src/to-readable-stream.js";

describe("toReadableStream", () => {
  test("同期イテラブルを ReadableStream に変換する", async ({ expect }) => {
    // 実行：
    const stream = toReadableStream([1, 2, 3]);

    // 検証：
    const values = await readAll(stream);
    expect(values).toEqual([1, 2, 3]);
  });

  test("非同期イテラブルを ReadableStream に変換する", async ({ expect }) => {
    // 準備：
    // oxlint-disable-next-line unicorn/consistent-function-scoping
    async function* asyncGen(): AsyncGenerator<number, void, unknown> {
      yield 1;
      yield 2;
      yield 3;
    }

    // 実行：
    const stream = toReadableStream(asyncGen());

    // 検証：
    const values = await readAll(stream);
    expect(values).toEqual([1, 2, 3]);
  });

  test("空のイテラブルを ReadableStream に変換する", async ({ expect }) => {
    // 実行：
    const stream = toReadableStream([]);

    // 検証：
    const values = await readAll(stream);
    expect(values).toEqual([]);
  });

  test("文字列のイテラブルを ReadableStream に変換する", async ({ expect }) => {
    // 実行：
    const stream = toReadableStream("abc");

    // 検証：
    const values = await readAll(stream);
    expect(values).toEqual(["a", "b", "c"]);
  });
});
