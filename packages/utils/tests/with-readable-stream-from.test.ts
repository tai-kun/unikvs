import { describe, test } from "vitest";

import withReadableStreamFrom from "../src/with-readable-stream-from.js";

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

describe("withReadableStreamFrom", () => {
  test("同期イテラブルから ReadableStream を生成する", async ({ expect }) => {
    // 実行
    const stream = withReadableStreamFrom((ReadableStream) => ReadableStream.from([1, 2, 3]));

    // 検証
    const values = await collectFromStream(stream);
    expect(values).toEqual([1, 2, 3]);
  });

  test("非同期イテラブルから ReadableStream を生成する", async ({ expect }) => {
    // 準備
    async function* asyncGen() {
      yield 1;
      yield 2;
      yield 3;
    }

    // 実行
    const stream = withReadableStreamFrom((ReadableStream) => ReadableStream.from(asyncGen()));

    // 検証
    const values = await collectFromStream(stream);
    expect(values).toEqual([1, 2, 3]);
  });

  test("ReadableStream.from が存在しない場合はポリフィルを使用する", async ({ expect }) => {
    // 準備
    const originalFrom = (ReadableStream as any).from;
    delete (ReadableStream as any).from;

    try {
      // 実行
      const stream = withReadableStreamFrom((RS) => RS.from([1, 2, 3]));

      // 検証
      const values = await collectFromStream(stream);
      expect(values).toEqual([1, 2, 3]);
    } finally {
      // 後片付け
      (ReadableStream as any).from = originalFrom;
    }
  });

  test("ポリフィルが非同期イテラブルを正しく処理する", async ({ expect }) => {
    // 準備
    const originalFrom = (ReadableStream as any).from;
    delete (ReadableStream as any).from;

    async function* asyncGen() {
      yield "a";
      yield "b";
      yield "c";
    }

    try {
      // 実行
      const stream = withReadableStreamFrom((RS) => RS.from(asyncGen()));

      // 検証
      const values = await collectFromStream(stream);
      expect(values).toEqual(["a", "b", "c"]);
    } finally {
      (ReadableStream as any).from = originalFrom;
    }
  });

  test("ポリフィル使用後に ReadableStream.from が削除される", ({ expect }) => {
    // 準備
    const originalFrom = (ReadableStream as any).from;
    delete (ReadableStream as any).from;

    // 実行
    withReadableStreamFrom((RS) => RS.from([1]));

    // 検証: クリーンアップ後も from が存在しない
    expect("from" in ReadableStream).toBe(false);

    // 後片付け
    (ReadableStream as any).from = originalFrom;
  });
});
