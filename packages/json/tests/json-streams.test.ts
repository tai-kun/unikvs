import type { IMiddleware } from "@unikvs/core";
import {
  readAll,
  createNext,
  sourceFrom,
  concatBytes,
  splitIntoChunks,
  createDecodeContext,
  createEncodeContext,
  createDecodeStreamContext,
  createEncodeStreamContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

// oxlint-disable unicorn/number-literal-case
import { JsonUnsupportedValueError } from "../src/index.js";
import Json from "../src/json.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * settled 結果から書き込みエラーまたは読み取りエラーを取り出します。
 */
function getSettledError(settled: {
  readonly readError: unknown;
  readonly writeError: unknown;
}): unknown {
  return settled.writeError ?? settled.readError;
}

/**
 * 文字列を UTF-8 のバイト列へ変換します。
 */
function jsonLines(text: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(text);
}

/**
 * 値をエンコードして JSON のバイト列を返します。
 */
async function encodeValue(json: Json, value: unknown): Promise<Uint8Array<ArrayBuffer>> {
  const c = createEncodeContext(value);
  await json.encode(c as IMiddleware.EncodeContext, createNext());

  return c.destination;
}

/**
 * バイト列をデコードして値を返します。
 */
async function decodeValue(json: Json, data: Uint8Array<ArrayBuffer>): Promise<unknown> {
  const c = createDecodeContext(data);
  await json.decode(c as IMiddleware.DecodeContext, createNext());

  return c.destination;
}

/**
 * 読み取り中に起きたエラーを握り潰さずに観測しつつ、読み取れたデータをすべて集めます。
 * ストリームの書き込み・読み取り時のエラーを検証するために使用します。
 */
async function collectSettled<T>(stream: ReadableStream<T>): Promise<{
  readError: unknown;
  writeError: undefined;
  outputChunks: T[];
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

  return {
    readError,
    writeError: undefined,
    outputChunks,
  };
}

/**
 * 値の列をエンコードストリームに流し、出力されたチャンクを返します。
 */
function pumpEncode(
  json: Json,
  values: readonly unknown[],
): Promise<{
  readError: unknown;
  writeError: undefined;
  outputChunks: Uint8Array<ArrayBuffer>[];
}> {
  const c = createEncodeStreamContext(sourceFrom(values));

  return json
    .encodeStream(c as IMiddleware.EncodeStreamContext, createNext())
    .then(() => collectSettled(c.destination as ReadableStream<Uint8Array<ArrayBuffer>>));
}

/**
 * バイト列をデコードストリームに流し、出力された値を返します。
 */
function pumpDecode(
  json: Json,
  chunks: readonly Uint8Array<ArrayBuffer>[],
): Promise<{
  readError: unknown;
  writeError: undefined;
  outputChunks: unknown[];
}> {
  const c = createDecodeStreamContext(sourceFrom(chunks));

  return json
    .decodeStream(c as IMiddleware.DecodeStreamContext, createNext())
    .then(() => collectSettled(c.destination as ReadableStream<unknown>));
}

describe("encodeStream", () => {
  test("各値を 1 行の JSON として出力し、末尾に改行を付ける", async ({ expect }) => {
    // 準備：
    const json = new Json();
    const values: unknown[] = [1, "a", true, null, { b: 2 }, [3]];

    // 実行：
    const result = await pumpEncode(json, values);

    // 検証：
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(result.outputChunks).toHaveLength(values.length);

    for (const [index, chunk] of result.outputChunks.entries()) {
      expect(decoder.decode(chunk), `index=${index}`).toBe(`${JSON.stringify(values[index])}\n`);
    }

    expect(decoder.decode(concatBytes(result.outputChunks))).toBe(
      '1\n"a"\ntrue\nnull\n{"b":2}\n[3]\n',
    );
  });

  test("値に含まれる改行はエスケープされ行を壊さない", async ({ expect }) => {
    // 準備：
    const json = new Json();
    const values = ["a\nb", "c\rd", "\u2028\u2029", "😀"];

    // 実行：
    const encoded = await pumpEncode(json, values);
    const decoded = await pumpDecode(json, encoded.outputChunks);

    // 検証：
    expect(encoded.writeError).toBeUndefined();
    expect(encoded.readError).toBeUndefined();
    expect(decoded.writeError).toBeUndefined();
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual(values);
  });

  test("空のストリームは空の出力になる", async ({ expect }) => {
    // 準備：
    const json = new Json();

    // 実行：
    const result = await pumpEncode(json, []);

    // 検証：
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(result.outputChunks).toStrictEqual([]);
  });

  test("JSON に変換できない値は JsonUnsupportedValueError で拒否される", async ({ expect }) => {
    // 準備：
    const json = new Json();

    // 実行：
    const result = await pumpEncode(json, [1, Symbol("x"), 2]);

    // 検証：
    expect(getSettledError(result)).toBeInstanceOf(JsonUnsupportedValueError);
  });
});

describe("decodeStream", () => {
  test("複数の値をデコードする", async ({ expect }) => {
    // 準備：
    const json = new Json();

    // 実行：
    const result = await pumpDecode(json, [jsonLines('1\n"a"\ntrue\nnull\n{"b":2}\n[3]\n')]);

    // 検証：
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(result.outputChunks).toStrictEqual([1, "a", true, null, { b: 2 }, [3]]);
  });

  test("1 バイトずつ分割してもデコードできる", async ({ expect }) => {
    // 準備：
    const json = new Json();
    const bytes = jsonLines('{"message":"日本語😀","values":[1,2,3]}\n');

    // 実行：
    const result = await pumpDecode(json, splitIntoChunks(bytes, 1));

    // 検証：
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(result.outputChunks).toStrictEqual([
      {
        values: [1, 2, 3],
        message: "日本語😀",
      },
    ]);
  });

  test("不揃いな境界で分割してもデコードできる", async ({ expect }) => {
    // 準備：
    const json = new Json();
    const values = [{ a: "x".repeat(100) }, [1, 2, 3], "末尾", 0];
    const bytes = jsonLines(values.map((value) => `${JSON.stringify(value)}\n`).join(""));

    // 実行と検証：
    for (const size of [1, 2, 3, 5, 7, 13, 64]) {
      const result = await pumpDecode(json, splitIntoChunks(bytes, size));
      expect(result.writeError, `size=${size}`).toBeUndefined();
      expect(result.readError, `size=${size}`).toBeUndefined();
      expect(result.outputChunks, `size=${size}`).toStrictEqual(values);
    }
  });

  test("最終行は末尾の改行がなくてもデコードされる", async ({ expect }) => {
    // 準備：
    const json = new Json();

    // 実行と検証：
    for (const text of ["1\n2\n3", "1\n2\n3\n"]) {
      const result = await pumpDecode(json, [jsonLines(text)]);
      expect(result.writeError, text).toBeUndefined();
      expect(result.readError, text).toBeUndefined();
      expect(result.outputChunks, text).toStrictEqual([1, 2, 3]);
    }
  });

  test("CRLF の改行を受理する", async ({ expect }) => {
    // 準備：
    const json = new Json();

    // 実行：
    const result = await pumpDecode(json, [jsonLines('1\r\n2\r\n"a"\r\n')]);

    // 検証：
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(result.outputChunks).toStrictEqual([1, 2, "a"]);
  });

  test("空行は読み飛ばす", async ({ expect }) => {
    // 準備：
    const json = new Json();
    const cases: [string, unknown[]][] = [
      ["\n\n1\n\n2\n", [1, 2]],
      ["1\r\n\r\n2\r\n", [1, 2]],
      ["\n", []],
      ["\r\n", []],
      ["\r", []],
    ];

    // 実行と検証：
    for (const [text, expected] of cases) {
      const result = await pumpDecode(json, [jsonLines(text)]);
      expect(result.writeError, JSON.stringify(text)).toBeUndefined();
      expect(result.readError, JSON.stringify(text)).toBeUndefined();
      expect(result.outputChunks, JSON.stringify(text)).toStrictEqual(expected);
    }
  });

  test("空のストリームは値を出力しない", async ({ expect }) => {
    // 準備：
    const json = new Json();

    // 実行：
    const empty = await pumpDecode(json, []);
    const zeroBytes = await pumpDecode(json, [new Uint8Array(0)]);

    // 検証：
    expect(empty.writeError).toBeUndefined();
    expect(empty.readError).toBeUndefined();
    expect(empty.outputChunks).toStrictEqual([]);
    expect(zeroBytes.writeError).toBeUndefined();
    expect(zeroBytes.readError).toBeUndefined();
    expect(zeroBytes.outputChunks).toStrictEqual([]);
  });

  test("不正な行は SyntaxError で拒否される", async ({ expect }) => {
    // 準備：
    const json = new Json();

    // 実行：
    const result = await pumpDecode(json, [jsonLines("1\n{bad}\n2\n")]);

    // 検証：
    expect(getSettledError(result)).toBeInstanceOf(SyntaxError);
  });

  test("不正な UTF-8 は TypeError で拒否される", async ({ expect }) => {
    // 準備：
    const json = new Json();
    const invalid = Uint8Array.from([0x31, 0x0a, 0xff, 0x0a]);
    const truncated = Uint8Array.from([0x31, 0x0a, 0xe3]);

    // 実行：
    const invalidResult = await pumpDecode(json, [invalid]);
    const truncatedResult = await pumpDecode(json, [truncated]);

    // 検証：
    expect(getSettledError(invalidResult)).toBeInstanceOf(TypeError);
    expect(getSettledError(truncatedResult)).toBeInstanceOf(TypeError);
  });

  test("大きな値をチャンク境界をまたいでデコードできる", async ({ expect }) => {
    // 準備：
    const json = new Json();
    const value = {
      text: "日本語😀".repeat(20_000),
      items: Array.from({ length: 1000 }, (_, index) => index),
    };
    const bytes = await encodeValue(json, value);

    // 実行：
    const result = await pumpDecode(json, splitIntoChunks(bytes, 7));

    // 検証：
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(result.outputChunks).toStrictEqual([value]);
  });

  test("読み取り側をキャンセルすると上流のソースもキャンセルされる", async ({ expect }) => {
    // 準備：
    const json = new Json();
    let cancelled = false;
    const source = new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller): void {
        controller.enqueue(jsonLines("1\n2\n"));
      },
      cancel(): void {
        cancelled = true;
      },
    });
    const c = createDecodeStreamContext(source);
    await json.decodeStream(c as IMiddleware.DecodeStreamContext, createNext());

    const stream = c.destination as ReadableStream<Uint8Array<ArrayBuffer>>;
    const reader = stream.getReader();

    // 実行：
    const first = await reader.read();
    await reader.cancel();
    // キャンセルは非同期に上流へ伝播するため、伝播の完了を待ちます。
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    // 検証：
    expect(first.value).toBe(1);
    expect(cancelled).toBe(true);
  });
});

describe("ストリームの往復", () => {
  test("encodeStream と decodeStream を往復すると元の値に戻る", async ({ expect }) => {
    // 準備：
    const json = new Json();
    const values: unknown[] = [
      {
        id: 1,
        name: "日本語😀",
      },
      [null, true, false, 0, ""],
      "line\nbreak",
    ];

    // 実行：
    const encodedContext = createEncodeStreamContext(sourceFrom(values));
    await json.encodeStream(encodedContext as IMiddleware.EncodeStreamContext, createNext());

    const decodedContext = createDecodeStreamContext(
      encodedContext.destination as ReadableStream<Uint8Array<ArrayBuffer>>,
    );
    await json.decodeStream(decodedContext as IMiddleware.DecodeStreamContext, createNext());

    const decoded = await readAll(decodedContext.destination);

    // 検証：
    expect(decoded).toStrictEqual(values);
  });

  test("出力チャンクの連結を一括 decode すると先頭の値に戻る", async ({ expect }) => {
    // 準備：
    const json = new Json();
    const value = {
      a: 1,
      b: [2, 3],
    };

    // 実行：
    const encoded = await pumpEncode(json, [value]);
    const decoded = await decodeValue(json, concatBytes(encoded.outputChunks));

    // 検証：
    expect(encoded.writeError).toBeUndefined();
    expect(encoded.readError).toBeUndefined();
    expect(decoded).toStrictEqual(value);
  });

  test("一括 encode した結果を小さなチャンクで decode できる", async ({ expect }) => {
    // 準備：
    const json = new Json();
    const value = Array.from({ length: 100 }, () => "値😀");

    // 実行：
    const encoded = await encodeValue(json, value);
    const result = await pumpDecode(json, splitIntoChunks(encoded, 3));

    // 検証：
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(result.outputChunks).toStrictEqual([value]);
  });
});
