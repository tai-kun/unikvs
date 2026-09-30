import { describe, test } from "vitest";

import PassThrough from "../src/passthrough.js";

/**
 * 複数のチャンクをストリームに流し込み、出力されたチャンクを順に返します。
 * 素通しされることを検証するために使用します。
 */
async function pipeChunks<T>(stream: TransformStream<T, T>, chunks: readonly T[]): Promise<T[]> {
  const readable = new ReadableStream<T>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
  const reader = readable.pipeThrough(stream).getReader();
  const output: T[] = [];

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    output.push(value);
  }

  return output;
}

describe("初期化と基本属性", () => {
  test("name プロパティは PassThrough を返す", ({ expect }) => {
    // 準備
    const passthrough = new PassThrough();

    // 実行と検証
    expect(passthrough.name).toBe("PassThrough");
  });

  test("isOpen は常に true を返す", ({ expect }) => {
    // 準備
    const passthrough = new PassThrough();

    // 実行と検証
    expect(passthrough.isOpen).toBe(true);
  });
});

describe("データの透過", () => {
  test("encode は文字列をそのまま返す", ({ expect }) => {
    // 準備
    const passthrough = new PassThrough();
    const data = "hello";

    // 実行
    const output = passthrough.encode({ data });

    // 検証
    expect(output).toBe(data);
  });

  test("encode はバイト列をそのまま返す", ({ expect }) => {
    // 準備
    const passthrough = new PassThrough();
    const data = new Uint8Array([1, 2, 3]);

    // 実行
    const output = passthrough.encode({ data });

    // 検証
    expect(output).toBe(data);
  });

  test("encode はオブジェクトを同じ参照のまま返す", ({ expect }) => {
    // 準備
    const passthrough = new PassThrough();
    const data = { foo: "bar" };

    // 実行
    const output = passthrough.encode({ data });

    // 検証
    expect(output).toBe(data);
  });

  test("encode は入力の型を保持する", ({ expect }) => {
    // 準備
    const passthrough = new PassThrough();
    const data: Uint8Array<ArrayBuffer> = new Uint8Array([1, 2, 3]);

    // 実行
    const output: Uint8Array<ArrayBuffer> = passthrough.encode({ data });

    // 検証
    expect(output).toBe(data);
  });

  test("decode は文字列をそのまま返す", ({ expect }) => {
    // 準備
    const passthrough = new PassThrough();
    const data = "hello";

    // 実行
    const output = passthrough.decode({ data });

    // 検証
    expect(output).toBe(data);
  });

  test("decode はバイト列をそのまま返す", ({ expect }) => {
    // 準備
    const passthrough = new PassThrough();
    const data = new Uint8Array([1, 2, 3]);

    // 実行
    const output = passthrough.decode({ data });

    // 検証
    expect(output).toBe(data);
  });

  test("decode はオブジェクトを同じ参照のまま返す", ({ expect }) => {
    // 準備
    const passthrough = new PassThrough();
    const data = { foo: "bar" };

    // 実行
    const output = passthrough.decode({ data });

    // 検証
    expect(output).toBe(data);
  });

  test("decode は入力の型を保持する", ({ expect }) => {
    // 準備
    const passthrough = new PassThrough();
    const data: Uint8Array<ArrayBuffer> = new Uint8Array([1, 2, 3]);

    // 実行
    const output: Uint8Array<ArrayBuffer> = passthrough.decode({ data });

    // 検証
    expect(output).toBe(data);
  });
});

describe("ストリームの透過", () => {
  test("getEncodable はチャンクをそのまま出力する", async ({ expect }) => {
    // 準備
    const passthrough = new PassThrough();
    const chunks = [new Uint8Array([1, 2]), new Uint8Array([3]), new Uint8Array(0)];

    // 実行
    const output = await pipeChunks(passthrough.getEncodable(), chunks);

    // 検証
    expect(output).toHaveLength(chunks.length);

    for (const [i, chunk] of output.entries()) {
      expect(chunk).toBe(chunks[i]);
    }
  });

  test("getDecodable はチャンクをそのまま出力する", async ({ expect }) => {
    // 準備
    const passthrough = new PassThrough();
    const chunks = [new Uint8Array([1, 2]), new Uint8Array([3]), new Uint8Array(0)];

    // 実行
    const output = await pipeChunks(passthrough.getDecodable(), chunks);

    // 検証
    expect(output).toHaveLength(chunks.length);

    for (const [i, chunk] of output.entries()) {
      expect(chunk).toBe(chunks[i]);
    }
  });

  test("getEncodable はチャンクの境界を変えない", async ({ expect }) => {
    // 準備
    const passthrough = new PassThrough();
    const chunks = ["a", "bc", "", "def"];

    // 実行
    const output = await pipeChunks(passthrough.getEncodable(), chunks);

    // 検証
    expect(output).toStrictEqual(chunks);
  });

  test("getDecodable はチャンクの境界を変えない", async ({ expect }) => {
    // 準備
    const passthrough = new PassThrough();
    const chunks = ["a", "bc", "", "def"];

    // 実行
    const output = await pipeChunks(passthrough.getDecodable(), chunks);

    // 検証
    expect(output).toStrictEqual(chunks);
  });

  test("getEncodable は空ストリームを空のまま出力する", async ({ expect }) => {
    // 準備
    const passthrough = new PassThrough();

    // 実行
    const output = await pipeChunks(passthrough.getEncodable(), []);

    // 検証
    expect(output).toStrictEqual([]);
  });

  test("getDecodable は空ストリームを空のまま出力する", async ({ expect }) => {
    // 準備
    const passthrough = new PassThrough();

    // 実行
    const output = await pipeChunks(passthrough.getDecodable(), []);

    // 検証
    expect(output).toStrictEqual([]);
  });
});
