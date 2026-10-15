import type { IMiddleware } from "@unikvs/core";
import {
  concatBytes,
  createDecodeStreamContext,
  createEncodeContext,
  createEncodeStreamContext,
  createNext,
  sourceFrom,
  splitIntoChunks,
} from "@unikvs/testing";
import { describe, test } from "vitest";

import Cbor from "../src/cbor.js";
import { CborDecodeError, CborEncodeError } from "../src/errors.js";

const cbor = new Cbor();

/**
 * 値を CBOR のバイト列へ変換します。
 */
async function encode(data: unknown): Promise<Uint8Array<ArrayBuffer>> {
  const c = createEncodeContext(data);
  await cbor.encode(c as IMiddleware.EncodeContext, createNext());

  return c.destination;
}

/**
 * 読み取り中に起きたエラーを握り潰さずに観測しつつ、読み取れたデータをすべて集めます。
 * ストリームの書き込み・読み取り時のエラーを検証するために使用します。
 */
async function collectSettled<T>(stream: ReadableStream<T>): Promise<{
  outputChunks: T[];
  writeError: undefined;
  readError: unknown;
}> {
  const outputChunks: T[] = [];
  let readError: unknown;
  const reader = stream.getReader();

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      outputChunks.push(value);
    }
  } catch (ex) {
    readError = ex;
  }

  return { outputChunks, writeError: undefined, readError };
}

/**
 * 値の列をエンコードストリームに流し、出力されたチャンクを返します。
 */
function pumpEncode(
  cbor: Cbor,
  values: readonly unknown[],
): Promise<{
  outputChunks: Uint8Array<ArrayBuffer>[];
  writeError: undefined;
  readError: unknown;
}> {
  const c = createEncodeStreamContext(sourceFrom(values));

  return cbor
    .encodeStream(c as IMiddleware.EncodeStreamContext, createNext())
    .then(() => collectSettled(c.destination as ReadableStream<Uint8Array<ArrayBuffer>>));
}

/**
 * バイト列をデコードストリームに流し、出力された値を返します。
 */
function pumpDecode(
  cbor: Cbor,
  chunks: readonly Uint8Array<ArrayBuffer>[],
): Promise<{
  outputChunks: unknown[];
  writeError: undefined;
  readError: unknown;
}> {
  const c = createDecodeStreamContext(sourceFrom(chunks));

  return cbor
    .decodeStream(c as IMiddleware.DecodeStreamContext, createNext())
    .then(() => collectSettled(c.destination as ReadableStream<unknown>));
}

/**
 * 手動で制御できる上流ソースでデコードストリームを起動し、制御子と読み取り子を返します。
 * チャンク境界や中断の伝播を検証するために使用します。
 */
async function startDecoding(): Promise<{
  enqueue: (chunk: Uint8Array<ArrayBuffer>) => void;
  error: (reason: unknown) => void;
  close: () => void;
  reader: ReadableStreamDefaultReader<unknown>;
}> {
  let sourceController!: ReadableStreamDefaultController<Uint8Array<ArrayBuffer>>;
  const source = new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(controller) {
      sourceController = controller;
    },
  });
  const c = createDecodeStreamContext(source);
  await cbor.decodeStream(c as IMiddleware.DecodeStreamContext, createNext());
  const reader = (c.destination as ReadableStream<unknown>).getReader();

  return {
    enqueue: (chunk) => sourceController.enqueue(chunk),
    error: (reason) => sourceController.error(reason),
    close: () => sourceController.close(),
    reader,
  };
}

/**
 * 1 回の読み取りが解決するまでマイクロタスクとタイマーを進めます。
 * 値が送出されないことの検証に使用します。
 */
async function tick(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe("CBOR シーケンスの往復", () => {
  test("複数の値をストリームで往復すると元の値に戻る", async ({ expect }) => {
    // 準備
    const values = [
      1,
      "two",
      { three: 3 },
      [4, 5],
      null,
      undefined,
      18446744073709551615n,
      Uint8Array.of(1, 2),
      new Date(0),
      new Map([[1, "one"]]),
      new Set([1, 2]),
    ];

    // 実行
    const encoded = await pumpEncode(cbor, values);
    const decoded = await pumpDecode(cbor, encoded.outputChunks);

    // 検証
    expect(encoded.writeError).toBeUndefined();
    expect(encoded.readError).toBeUndefined();
    expect(encoded.outputChunks).toHaveLength(values.length);
    expect(decoded.writeError).toBeUndefined();
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual(values);
  });

  test("単体の値をストリームで往復すると元の値に戻る", async ({ expect }) => {
    // 準備
    const value = { message: "hello", count: 42 };

    // 実行
    const encoded = await pumpEncode(cbor, [value]);
    const decoded = await pumpDecode(cbor, encoded.outputChunks);

    // 検証
    expect(encoded.writeError).toBeUndefined();
    expect(encoded.readError).toBeUndefined();
    expect(decoded.writeError).toBeUndefined();
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual([value]);
  });

  test("1 つのチャンクに複数の値が含まれていても順にデコードされる", async ({ expect }) => {
    // 準備
    const values = [1, "two", [3]];
    const input = concatBytes([
      await encode(values[0]),
      await encode(values[1]),
      await encode(values[2]),
    ]);

    // 実行
    const decoded = await pumpDecode(cbor, [input]);

    // 検証
    expect(decoded.writeError).toBeUndefined();
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual(values);
  });

  test("空のストリームは値を 1 つも生成しない", async ({ expect }) => {
    // 実行
    const encoded = await pumpEncode(cbor, []);
    const decoded = await pumpDecode(cbor, []);

    // 検証
    expect(encoded.writeError).toBeUndefined();
    expect(encoded.readError).toBeUndefined();
    expect(encoded.outputChunks).toStrictEqual([]);
    expect(decoded.writeError).toBeUndefined();
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual([]);
  });

  test("長さ 0 のチャンクは無視される", async ({ expect }) => {
    // 準備
    const chunks = [
      new Uint8Array(0),
      await encode(1),
      new Uint8Array(0),
      await encode(2),
      new Uint8Array(0),
    ];

    // 実行
    const decoded = await pumpDecode(cbor, chunks);

    // 検証
    expect(decoded.writeError).toBeUndefined();
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual([1, 2]);
  });
});

describe("チャンク境界", () => {
  test("1 バイトずつ届く CBOR シーケンスをデコードできる", async ({ expect }) => {
    // 準備
    const values = [1, "abcdef", { nested: [true, null] }, 18446744073709551615n];
    const input = concatBytes([
      await encode(values[0]),
      await encode(values[1]),
      await encode(values[2]),
      await encode(values[3]),
    ]);

    // 実行
    const decoded = await pumpDecode(cbor, splitIntoChunks(input, 1));

    // 検証
    expect(decoded.writeError).toBeUndefined();
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual(values);
  });

  test("RegExp を 1 バイトずつ届くチャンクでデコードできる", async ({ expect }) => {
    // 準備
    const values = [/ab/gi, new RegExp("a".repeat(200), "g")];
    const input = concatBytes([await encode(values[0]), await encode(values[1])]);

    // 実行
    const decoded = await pumpDecode(cbor, splitIntoChunks(input, 1));

    // 検証
    expect(decoded.writeError).toBeUndefined();
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual(values);
  });

  test("途中までしか届いていない値は送出されない", async ({ expect }) => {
    // 準備
    const encoded = await encode("hello world");
    const { enqueue, close, reader } = await startDecoding();

    // 実行
    enqueue(encoded.subarray(0, 1));

    let emitted = false;
    const reading = reader.read().then((result) => {
      emitted = true;
      return result;
    });

    await tick();

    // 検証
    expect(emitted).toBe(false);

    // 実行
    enqueue(encoded.subarray(1));
    close();

    // 検証
    expect((await reading).value).toBe("hello world");
    expect(await reader.read()).toStrictEqual({ done: true, value: undefined });
  });

  test("完成済みの値と未完成の値が同じチャンクにあれば完成分だけ送出される", async ({ expect }) => {
    // 準備
    const first = await encode(1);
    const second = await encode(2);
    const partial = (await encode("three")).subarray(0, 1);
    const { enqueue, reader } = await startDecoding();

    // 実行
    enqueue(concatBytes([first, second, partial]));

    // 検証
    expect((await reader.read()).value).toBe(1);
    expect((await reader.read()).value).toBe(2);

    let emitted = false;
    const pending = reader.read().then(
      (result) => {
        emitted = true;
        return result;
      },
      (error) => {
        emitted = true;
        throw error;
      },
    );

    await tick();
    expect(emitted).toBe(false);

    // 後始末
    await reader.cancel();
    expect((await pending).done).toBe(true);
  });

  test("大きな値を 1 バイトずつ届くチャンクでデコードできる", async ({ expect }) => {
    // 準備
    const input = new Uint8Array(64 * 1024);
    for (let index = 0; index < input.length; index++) {
      input[index] = index % 251;
    }

    // 実行
    const encoded = await encode(input);
    const decoded = await pumpDecode(cbor, splitIntoChunks(encoded, 1));

    // 検証
    expect(decoded.writeError).toBeUndefined();
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual([input]);
  });

  test("1 MiB の値を適度なチャンクに分割してもデコードできる", async ({ expect }) => {
    // 準備
    const input = new Uint8Array(1024 * 1024);
    for (let index = 0; index < input.length; index++) {
      input[index] = index % 251;
    }

    // 実行
    const encoded = await encode(input);
    const decoded = await pumpDecode(cbor, splitIntoChunks(encoded, 1024));

    // 検証
    expect(decoded.writeError).toBeUndefined();
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual([input]);
  });
});

describe("ストリームの異常系", () => {
  test("終了時に未完成のアイテムが残ると完成済みの値を送出してから拒否される", async ({
    expect,
  }) => {
    // 準備
    const encoded = await encode({ a: 1 });
    const input = concatBytes([await encode(1), encoded.subarray(0, encoded.length - 1)]);

    // 実行
    const decoded = await pumpDecode(cbor, [input]);

    // 検証
    const error = decoded.writeError ?? decoded.readError;
    expect(error).toBeInstanceOf(CborDecodeError);
    expect((error as CborDecodeError).cause).toBeInstanceOf(Error);
    expect(decoded.outputChunks).toStrictEqual([1]);
  });

  test("終了時に未完成のアイテムだけが残ると値を送出せずに拒否される", async ({ expect }) => {
    // 準備
    const encoded = await encode({ a: 1 });

    // 実行
    const decoded = await pumpDecode(cbor, [encoded.subarray(0, encoded.length - 1)]);

    // 検証
    const error = decoded.writeError ?? decoded.readError;
    expect(error).toBeInstanceOf(CborDecodeError);
    expect((error as CborDecodeError).cause).toBeInstanceOf(Error);
    expect(decoded.outputChunks).toStrictEqual([]);
  });

  test("CBOR として不正なバイト列は CborDecodeError で拒否される", async ({ expect }) => {
    // 実行
    const decoded = await pumpDecode(cbor, [Uint8Array.of(0x1c)]);

    // 検証
    const error = decoded.writeError ?? decoded.readError;
    expect(error).toBeInstanceOf(CborDecodeError);
    expect((error as CborDecodeError).cause).toBeInstanceOf(Error);
    expect(decoded.outputChunks).toStrictEqual([]);
  });

  test("完成済みの値の直後に不正なバイト列が届いても拒否される", async ({ expect }) => {
    // 準備
    const input = concatBytes([await encode(1), Uint8Array.of(0x1c)]);

    // 実行
    const decoded = await pumpDecode(cbor, [input]);

    // 検証
    const error = decoded.writeError ?? decoded.readError;
    expect(error).toBeInstanceOf(CborDecodeError);
    expect((error as CborDecodeError).cause).toBeInstanceOf(Error);
    expect(decoded.outputChunks).toStrictEqual([]);
  });

  test("エンコードできない値を流すと CborEncodeError で拒否される", async ({ expect }) => {
    // 実行
    const encoded = await pumpEncode(cbor, [1, () => {}, 3]);

    // 検証
    const error = encoded.writeError ?? encoded.readError;
    expect(error).toBeInstanceOf(CborEncodeError);
    expect((error as CborEncodeError).cause).toBeInstanceOf(Error);
    expect(encoded.outputChunks).toStrictEqual([await encode(1)]);
  });

  test("読み取り側のキャンセルは上流へ伝播する", async ({ expect }) => {
    // 準備
    const one = await encode(1);
    const cancelReasons: unknown[] = [];
    const source = new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        controller.enqueue(one);
      },
      cancel(reason) {
        cancelReasons.push(reason);
      },
    });
    const c = createDecodeStreamContext(source);
    await cbor.decodeStream(c as IMiddleware.DecodeStreamContext, createNext());
    const reader = (c.destination as ReadableStream<unknown>).getReader();
    const reason = new Error("キャンセル");

    // 実行
    expect((await reader.read()).value).toBe(1);
    await reader.cancel(reason);
    // キャンセルは非同期に上流へ伝播するため、伝播の完了を待ちます。
    await tick();

    // 検証
    expect(cancelReasons).toStrictEqual([reason]);
  });

  test("上流の中断は読み取り側へ伝播する", async ({ expect }) => {
    // 準備
    const { error, reader } = await startDecoding();
    const reason = new Error("中断");

    // 実行
    const reading = reader.read();
    error(reason);

    // 検証
    await expect(reading).rejects.toBe(reason);
  });
});
