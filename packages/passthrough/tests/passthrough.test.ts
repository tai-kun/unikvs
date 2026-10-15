import type { IMiddleware } from "@unikvs/core";
import {
  createDecodeContext,
  createDecodeStreamContext,
  createEncodeContext,
  createEncodeStreamContext,
  createNext,
  readAll,
  sourceFrom,
} from "@unikvs/testing";
import { describe, test } from "vitest";

import PassThrough from "../src/passthrough.js";

/**
 * 値をエンコードして出力された値を返します。
 * 素通しされることを検証するために使用します。
 */
async function encode<T>(passthrough: PassThrough, data: T): Promise<T> {
  const c = createEncodeContext(data);
  await passthrough.encode(c as IMiddleware.EncodeContext, createNext());

  return c.destination as T;
}

/**
 * 値をデコードして出力された値を返します。
 * 素通しされることを検証するために使用します。
 */
async function decode<T>(passthrough: PassThrough, data: T): Promise<T> {
  const c = createDecodeContext(data);
  await passthrough.decode(c as IMiddleware.DecodeContext, createNext());

  return c.destination as T;
}

/**
 * 複数のチャンクをエンコードストリームに流し込み、出力されたチャンクを順に返します。
 * 素通しされることを検証するために使用します。
 */
async function encodeChunks<T>(passthrough: PassThrough, chunks: readonly T[]): Promise<T[]> {
  const c = createEncodeStreamContext(sourceFrom(chunks));
  await passthrough.encodeStream(c as IMiddleware.EncodeStreamContext, createNext());

  return readAll(c.destination);
}

/**
 * 複数のチャンクをデコードストリームに流し込み、出力されたチャンクを順に返します。
 * 素通しされることを検証するために使用します。
 */
async function decodeChunks<T>(passthrough: PassThrough, chunks: readonly T[]): Promise<T[]> {
  const c = createDecodeStreamContext(sourceFrom(chunks));
  await passthrough.decodeStream(c as IMiddleware.DecodeStreamContext, createNext());

  return readAll(c.destination);
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
  test("encode は文字列をそのまま返す", async ({ expect }) => {
    // 準備
    const passthrough = new PassThrough();
    const data = "hello";

    // 実行
    const output = await encode(passthrough, data);

    // 検証
    expect(output).toBe(data);
  });

  test("encode はバイト列をそのまま返す", async ({ expect }) => {
    // 準備
    const passthrough = new PassThrough();
    const data = new Uint8Array([1, 2, 3]);

    // 実行
    const output = await encode(passthrough, data);

    // 検証
    expect(output).toBe(data);
  });

  test("encode はオブジェクトを同じ参照のまま返す", async ({ expect }) => {
    // 準備
    const passthrough = new PassThrough();
    const data = { foo: "bar" };

    // 実行
    const output = await encode(passthrough, data);

    // 検証
    expect(output).toBe(data);
  });

  test("encode は入力の型を保持する", async ({ expect }) => {
    // 準備
    const passthrough = new PassThrough();
    const data: Uint8Array<ArrayBuffer> = new Uint8Array([1, 2, 3]);

    // 実行
    const output: Uint8Array<ArrayBuffer> = await encode(passthrough, data);

    // 検証
    expect(output).toBe(data);
  });

  test("decode は文字列をそのまま返す", async ({ expect }) => {
    // 準備
    const passthrough = new PassThrough();
    const data = "hello";

    // 実行
    const output = await decode(passthrough, data);

    // 検証
    expect(output).toBe(data);
  });

  test("decode はバイト列をそのまま返す", async ({ expect }) => {
    // 準備
    const passthrough = new PassThrough();
    const data = new Uint8Array([1, 2, 3]);

    // 実行
    const output = await decode(passthrough, data);

    // 検証
    expect(output).toBe(data);
  });

  test("decode はオブジェクトを同じ参照のまま返す", async ({ expect }) => {
    // 準備
    const passthrough = new PassThrough();
    const data = { foo: "bar" };

    // 実行
    const output = await decode(passthrough, data);

    // 検証
    expect(output).toBe(data);
  });

  test("decode は入力の型を保持する", async ({ expect }) => {
    // 準備
    const passthrough = new PassThrough();
    const data: Uint8Array<ArrayBuffer> = new Uint8Array([1, 2, 3]);

    // 実行
    const output: Uint8Array<ArrayBuffer> = await decode(passthrough, data);

    // 検証
    expect(output).toBe(data);
  });
});

describe("ストリームの透過", () => {
  test("encodeStream はチャンクをそのまま出力する", async ({ expect }) => {
    // 準備
    const passthrough = new PassThrough();
    const chunks = [new Uint8Array([1, 2]), new Uint8Array([3]), new Uint8Array(0)];

    // 実行
    const output = await encodeChunks(passthrough, chunks);

    // 検証
    expect(output).toHaveLength(chunks.length);

    for (const [i, chunk] of output.entries()) {
      expect(chunk).toBe(chunks[i]);
    }
  });

  test("decodeStream はチャンクをそのまま出力する", async ({ expect }) => {
    // 準備
    const passthrough = new PassThrough();
    const chunks = [new Uint8Array([1, 2]), new Uint8Array([3]), new Uint8Array(0)];

    // 実行
    const output = await decodeChunks(passthrough, chunks);

    // 検証
    expect(output).toHaveLength(chunks.length);

    for (const [i, chunk] of output.entries()) {
      expect(chunk).toBe(chunks[i]);
    }
  });

  test("encodeStream はチャンクの境界を変えない", async ({ expect }) => {
    // 準備
    const passthrough = new PassThrough();
    const chunks = ["a", "bc", "", "def"];

    // 実行
    const output = await encodeChunks(passthrough, chunks);

    // 検証
    expect(output).toStrictEqual(chunks);
  });

  test("decodeStream はチャンクの境界を変えない", async ({ expect }) => {
    // 準備
    const passthrough = new PassThrough();
    const chunks = ["a", "bc", "", "def"];

    // 実行
    const output = await decodeChunks(passthrough, chunks);

    // 検証
    expect(output).toStrictEqual(chunks);
  });

  test("encodeStream は空ストリームを空のまま出力する", async ({ expect }) => {
    // 準備
    const passthrough = new PassThrough();

    // 実行
    const output = await encodeChunks(passthrough, []);

    // 検証
    expect(output).toStrictEqual([]);
  });

  test("decodeStream は空ストリームを空のまま出力する", async ({ expect }) => {
    // 準備
    const passthrough = new PassThrough();

    // 実行
    const output = await decodeChunks(passthrough, []);

    // 検証
    expect(output).toStrictEqual([]);
  });
});
