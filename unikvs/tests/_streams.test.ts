import type { IReadableStream, IWritableStream } from "@unikvs/core";
import { describe, test } from "vitest";

import { isReadableStream, isWritableStream } from "../src/_streams.js";

/**
 * ReadableStream クラスを継承せず、同じインターフェースだけを備えたオブジェクトを作成します。
 */
function createCompatibleReadableStream<T>(stream: ReadableStream<T>): IReadableStream<T> {
  return {
    getReader: stream.getReader.bind(stream),
    pipeThrough: stream.pipeThrough.bind(stream),
    pipeTo: stream.pipeTo.bind(stream),
    tee: stream.tee.bind(stream),
    cancel: stream.cancel.bind(stream),
  } as unknown as IReadableStream<T>;
}

/**
 * WritableStream クラスを継承せず、同じインターフェースだけを備えたオブジェクトを作成します。
 */
function createCompatibleWritableStream<T>(stream: WritableStream<T>): IWritableStream<T> {
  return {
    getWriter: stream.getWriter.bind(stream),
    abort: stream.abort.bind(stream),
    close: stream.close.bind(stream),
  } as unknown as IWritableStream<T>;
}

describe("isReadableStream", () => {
  test("ReadableStream のインスタンスに対して true を返す", ({ expect }) => {
    expect(isReadableStream(new ReadableStream())).toBe(true);
  });

  test("ReadableStream クラスを継承しない互換オブジェクトに対して true を返す", ({ expect }) => {
    // 準備
    const stream = createCompatibleReadableStream(new ReadableStream());

    // 検証
    expect(isReadableStream(stream)).toBe(true);
  });

  test("ReadableStream のインターフェースを満たさない値に対して false を返す", ({ expect }) => {
    // 検証
    expect(isReadableStream(null)).toBe(false);
    expect(isReadableStream(42)).toBe(false);
    expect(isReadableStream({})).toBe(false);
    expect(isReadableStream({ getReader() {} })).toBe(false);
  });
});

describe("isWritableStream", () => {
  test("WritableStream のインスタンスに対して true を返す", ({ expect }) => {
    expect(isWritableStream(new WritableStream())).toBe(true);
  });

  test("WritableStream クラスを継承しない互換オブジェクトに対して true を返す", ({ expect }) => {
    // 準備
    const stream = createCompatibleWritableStream(new WritableStream());

    // 検証
    expect(isWritableStream(stream)).toBe(true);
  });

  test("WritableStream のインターフェースを満たさない値に対して false を返す", ({ expect }) => {
    // 検証
    expect(isWritableStream(null)).toBe(false);
    expect(isWritableStream(42)).toBe(false);
    expect(isWritableStream({})).toBe(false);
    expect(isWritableStream({ getWriter() {} })).toBe(false);
  });
});
