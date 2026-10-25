import { test, describe } from "vite-plus/test";

import { concatBytes } from "../src/bytes.js";
import {
  readAll,
  pipeChunks,
  sourceFrom,
  pumpThrough,
  collectBytes,
  runTransform,
  collectChunks,
} from "../src/streams.js";

describe("sourceFrom と readAll", () => {
  test("流した順序で読み取れる", async ({ expect }) => {
    // 実行：
    const result = await readAll(sourceFrom([1, 2, 3]));

    // 検証：
    expect(result).toStrictEqual([1, 2, 3]);
  });

  test("collectBytes は連結したバイト列を返す", async ({ expect }) => {
    // 準備：
    const chunks = [new Uint8Array([1]), new Uint8Array([2, 3])];

    // 実行：
    const result = await collectBytes(sourceFrom(chunks));

    // 検証：
    expect(result).toStrictEqual(concatBytes(chunks));
  });
});

describe("collectChunks", () => {
  test("恒等変換の出力を順に返す", async ({ expect }) => {
    // 準備：
    const stream = new TransformStream<number, number>();

    // 実行：
    const result = await collectChunks(stream, [1, 2]);

    // 検証：
    expect(result).toStrictEqual([1, 2]);

    expect(await pipeChunks(new TransformStream<number, number>(), [3])).toStrictEqual([3]);
  });
});

describe("pumpThrough", () => {
  test("書き込みと読み取りを並行して行う", async ({ expect }) => {
    // 準備：
    const transform = new TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>();

    // 実行：
    const result = await pumpThrough(transform, [new Uint8Array([1])]);

    // 検証：
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(concatBytes(result.outputChunks)).toStrictEqual(new Uint8Array([1]));
  });

  test("読み取り失敗を readError として返す", async ({ expect }) => {
    // 準備：
    const failure = new Error("read boom");
    const transform = new TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>({
      transform(): void {
        throw failure;
      },
    });

    // 実行：
    const result = await pumpThrough(transform, [new Uint8Array([1])]);

    // 検証：
    expect(result.readError).toBe(failure);
  });
});

describe("runTransform", () => {
  test("出力と closeError を返す", async ({ expect }) => {
    // 準備：
    const transform = new TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>();

    // 実行：
    const result = await runTransform(transform, [new Uint8Array([9])]);

    // 検証：
    expect(result.closeError).toBeUndefined();
    expect(concatBytes(result.outputChunks)).toStrictEqual(new Uint8Array([9]));
  });

  test("読み取り失敗を closeError として返す", async ({ expect }) => {
    // 準備：
    const failure = new Error("read boom");
    const stream = new TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>({
      transform(): void {
        throw failure;
      },
    });

    // 実行：
    const result = await runTransform(stream, [new Uint8Array([1])]);

    // 検証：
    expect(result.closeError).toBe(failure);
  });
});
