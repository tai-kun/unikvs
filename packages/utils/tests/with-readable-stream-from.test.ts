import { readAll } from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import withReadableStreamFrom from "../src/with-readable-stream-from.js";
import { withoutReadableStreamFrom } from "./helpers.js";

describe("withReadableStreamFrom", () => {
  test("同期イテラブルから ReadableStream を生成する", async ({ expect }) => {
    // 実行：
    const stream = withReadableStreamFrom((ReadableStream) => ReadableStream.from([1, 2, 3]));

    // 検証：
    const values = await readAll(stream);
    expect(values).toEqual([1, 2, 3]);
  });

  test("非同期イテラブルから ReadableStream を生成する", async ({ expect }) => {
    // 準備：
    // oxlint-disable-next-line unicorn/consistent-function-scoping
    async function* asyncGen(): AsyncGenerator<unknown, void, unknown> {
      yield 1;
      yield 2;
      yield 3;
    }

    // 実行：
    const stream = withReadableStreamFrom((ReadableStream) => ReadableStream.from(asyncGen()));

    // 検証：
    const values = await readAll(stream);
    expect(values).toEqual([1, 2, 3]);
  });

  test("ReadableStream.from が存在しない場合はポリフィルを使用する", async ({ expect }) => {
    // 準備：と実行。
    const values = await withoutReadableStreamFrom(async () => {
      const stream = withReadableStreamFrom((RS) => RS.from([1, 2, 3]));

      return readAll(stream);
    });

    // 検証：
    expect(values).toEqual([1, 2, 3]);
  });

  test("ポリフィルが非同期イテラブルを正しく処理する", async ({ expect }) => {
    // 準備：
    // oxlint-disable-next-line unicorn/consistent-function-scoping
    async function* asyncGen(): AsyncGenerator<unknown, void, unknown> {
      yield "a";
      yield "b";
      yield "c";
    }

    // 実行：
    const values = await withoutReadableStreamFrom(async () => {
      const stream = withReadableStreamFrom((RS) => RS.from(asyncGen()));

      return readAll(stream);
    });

    // 検証：
    expect(values).toEqual(["a", "b", "c"]);
  });

  test("ポリフィルでイテレーターのエラーがストリームに伝播する", async ({ expect }) => {
    // 準備：
    // oxlint-disable-next-line unicorn/consistent-function-scoping
    async function* failingGen(): AsyncGenerator<unknown, void, unknown> {
      yield 1;
      throw new Error("boom");
    }

    // 実行と検証：
    await withoutReadableStreamFrom(async () => {
      const stream = withReadableStreamFrom((RS) => RS.from(failingGen()));
      const reader = stream.getReader();

      // エラーまでのチャンクは読めて、その後の読み取りでエラーが再現される。
      expect(await reader.read()).toStrictEqual({
        done: false,
        value: 1,
      });
      await expect(reader.read()).rejects.toThrow("boom");
    });
  });

  test("ポリフィルのストリームをキャンセルするとイテレーターも閉じられる", async ({ expect }) => {
    // 準備：
    let closed = false;

    function* gen(): Generator<unknown, void, unknown> {
      try {
        yield 1;
        yield 2;
      } finally {
        closed = true;
      }
    }

    // 実行：
    await withoutReadableStreamFrom(async () => {
      const stream = withReadableStreamFrom((RS) => RS.from(gen()));
      const reader = stream.getReader();
      await reader.read();
      await reader.cancel();
    });

    // 検証：
    expect(closed).toBe(true);
  });

  test("ポリフィル使用後に ReadableStream.from が削除される", async ({ expect }) => {
    // 実行と検証：
    await withoutReadableStreamFrom(() => {
      withReadableStreamFrom((RS) => RS.from([1]));

      // クリーンアップ後も from が存在しない。
      expect("from" in ReadableStream).toBe(false);
    });
  });
});
