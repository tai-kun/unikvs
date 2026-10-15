import type { IMiddleware } from "@unikvs/core";
import {
  concatBytes,
  createDecodeContext,
  createDecodeStreamContext,
  createEncodeContext,
  createEncodeStreamContext,
  createNext,
  readAll,
  sourceFrom,
  sourceFromValues,
  splitIntoChunks,
  toText,
} from "@unikvs/testing";
import { describe, test } from "vitest";

import { SuperjsonUnsupportedValueError } from "../src/errors.js";
import Superjson from "../src/superjson.js";

/**
 * ストリームの往復検証で使用する値を含む配列です。
 */
const VALUES = [
  new Date("2024-01-02T03:04:05.678Z"),
  new Map<unknown, unknown>([
    ["a", 1],
    ["set", new Set([2, 3])],
  ]),
  123n,
  undefined,
  "日本語🎌",
  { nested: { ok: true }, list: [1, null] },
];

/**
 * 値をエンコードして SuperJSON ペイロードのバイト列を返します。
 */
async function encodeValue(codec: Superjson, value: unknown): Promise<Uint8Array<ArrayBuffer>> {
  const c = createEncodeContext(value);
  await codec.encode(c as IMiddleware.EncodeContext, createNext());

  return c.destination;
}

/**
 * バイト列をデコードして値を返します。
 */
async function decodeValue(codec: Superjson, data: Uint8Array<ArrayBuffer>): Promise<unknown> {
  const c = createDecodeContext(data);
  await codec.decode(c as IMiddleware.DecodeContext, createNext());

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
  codec: Superjson,
  values: readonly unknown[],
): Promise<{
  outputChunks: Uint8Array<ArrayBuffer>[];
  writeError: undefined;
  readError: unknown;
}> {
  const c = createEncodeStreamContext(sourceFrom(values));

  return codec
    .encodeStream(c as IMiddleware.EncodeStreamContext, createNext())
    .then(() => collectSettled(c.destination as ReadableStream<Uint8Array<ArrayBuffer>>));
}

/**
 * バイト列をデコードストリームに流し、出力された値を返します。
 */
function pumpDecode(
  codec: Superjson,
  chunks: readonly Uint8Array<ArrayBuffer>[],
): Promise<{
  outputChunks: unknown[];
  writeError: undefined;
  readError: unknown;
}> {
  const c = createDecodeStreamContext(sourceFrom(chunks));

  return codec
    .decodeStream(c as IMiddleware.DecodeStreamContext, createNext())
    .then(() => collectSettled(c.destination as ReadableStream<unknown>));
}

/**
 * 値の列をエンコードし、JSON Lines のバイト列へ変換します。
 */
async function encodeValues(
  codec: Superjson,
  values: readonly unknown[],
): Promise<Uint8Array<ArrayBuffer>> {
  const encoded = await pumpEncode(codec, values);

  return concatBytes(encoded.outputChunks);
}

/**
 * 値の列を JSON Lines の文字列へ変換します。
 * 1 つの値を 1 行として扱い、行末に改行を付けます。
 */
function toLines(values: readonly string[], terminator = "\n"): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(`${values.join(terminator)}${terminator}`);
}

/**
 * 値の列をエンコードストリームとデコードストリームで往復させます。
 */
async function roundTripStream(codec: Superjson, values: readonly unknown[]): Promise<unknown[]> {
  const encodeContext = createEncodeStreamContext(sourceFromValues(values));
  await codec.encodeStream(encodeContext as IMiddleware.EncodeStreamContext, createNext());
  const decodeContext = createDecodeStreamContext(
    encodeContext.destination as ReadableStream<Uint8Array<ArrayBuffer>>,
  );
  await codec.decodeStream(decodeContext as IMiddleware.DecodeStreamContext, createNext());

  return readAll(decodeContext.destination);
}

describe("Superjson のストリーム", () => {
  test("複数の値を JSONL として往復すると元に戻る", async ({ expect }) => {
    // 準備
    const codec = new Superjson();

    // 実行
    const decoded = await roundTripStream(codec, VALUES);

    // 検証
    expect(decoded).toStrictEqual(VALUES);
  });

  test("encodeStream は 1 行 1 値の JSON Lines を出力する", async ({ expect }) => {
    // 準備
    const codec = new Superjson();

    // 実行
    const encoded = await pumpEncode(codec, [{ a: 1 }, "text"]);

    // 検証
    expect(encoded.writeError).toBeUndefined();
    expect(encoded.readError).toBeUndefined();
    const text = toText(encoded.outputChunks);
    expect(text.endsWith("\n")).toBe(true);
    const lines = text.slice(0, -1).split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!)).toStrictEqual({ json: { a: 1 } });
    expect(JSON.parse(lines[1]!)).toStrictEqual({ json: "text" });
  });

  test("1 バイトずつのチャンクに分割してもデコードできる", async ({ expect }) => {
    // 準備
    const codec = new Superjson();
    const encoded = await encodeValues(codec, VALUES);

    // 実行
    const decoded = await pumpDecode(codec, splitIntoChunks(encoded, 1));

    // 検証
    expect(decoded.writeError).toBeUndefined();
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual(VALUES);
  });

  test("不揃いなチャンク境界でもデコードできる", async ({ expect }) => {
    // 準備
    const codec = new Superjson();
    const encoded = await encodeValues(codec, VALUES);
    const sizes = [3, 1, 4, 1, 5, 9, 2, 6];
    const chunks: Uint8Array<ArrayBuffer>[] = [];

    let offset = 0;
    let index = 0;
    while (offset < encoded.length) {
      const size = sizes[index % sizes.length]!;
      chunks.push(encoded.subarray(offset, Math.min(offset + size, encoded.length)));
      offset += size;
      index += 1;
    }

    // 実行
    const decoded = await pumpDecode(codec, chunks);

    // 検証
    expect(decoded.writeError).toBeUndefined();
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual(VALUES);
  });

  test("末尾に改行がある場合もない場合もデコードできる", async ({ expect }) => {
    // 準備
    const codec = new Superjson();
    const line = toText([await encodeValue(codec, "value")]);

    // 実行
    const withNewline = await pumpDecode(codec, [toLines([line])]);
    const withoutNewline = await pumpDecode(codec, [new TextEncoder().encode(line)]);

    // 検証
    expect(withNewline.readError).toBeUndefined();
    expect(withoutNewline.readError).toBeUndefined();
    expect(withNewline.outputChunks).toStrictEqual(["value"]);
    expect(withoutNewline.outputChunks).toStrictEqual(["value"]);
  });

  test("CRLF の改行を受け付ける", async ({ expect }) => {
    // 準備
    const codec = new Superjson();
    const first = toText([await encodeValue(codec, "first")]);
    const second = toText([await encodeValue(codec, { second: true })]);

    // 実行
    const decoded = await pumpDecode(codec, [toLines([first, second], "\r\n")]);

    // 検証
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual(["first", { second: true }]);
  });

  test("空行はスキップする", async ({ expect }) => {
    // 準備
    const codec = new Superjson();
    const first = toText([await encodeValue(codec, 1)]);
    const second = toText([await encodeValue(codec, 2)]);
    const text = `\n${first}\n\n\r\n${second}\n`;

    // 実行
    const decoded = await pumpDecode(codec, [new TextEncoder().encode(text)]);

    // 検証
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual([1, 2]);
  });

  test("空のストリームは値を 1 つも返さない", async ({ expect }) => {
    // 準備
    const codec = new Superjson();

    // 実行
    const encoded = await pumpEncode(codec, []);
    const decoded = await pumpDecode(codec, []);

    // 検証
    expect(encoded.writeError).toBeUndefined();
    expect(encoded.readError).toBeUndefined();
    expect(encoded.outputChunks).toStrictEqual([]);
    expect(decoded.writeError).toBeUndefined();
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual([]);
  });

  test("一括 encode の出力をストリームでデコードできる", async ({ expect }) => {
    // 準備
    const codec = new Superjson();
    const value = { date: new Date(0), big: 1n };

    // 実行
    const decoded = await pumpDecode(codec, [await encodeValue(codec, value)]);

    // 検証
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual([value]);
  });

  test("ストリーム encode の出力を一括 decode できる", async ({ expect }) => {
    // 準備
    const codec = new Superjson();
    const value = { list: [1, 2, 3] };

    // 実行
    const encoded = await pumpEncode(codec, [value]);
    const decoded = await decodeValue(codec, concatBytes(encoded.outputChunks));

    // 検証
    expect(encoded.writeError).toBeUndefined();
    expect(encoded.readError).toBeUndefined();
    expect(decoded).toStrictEqual(value);
  });

  test("大きな値も往復できる", async ({ expect }) => {
    // 準備
    const codec = new Superjson();
    const value = "0123456789".repeat(64 * 1024);

    // 実行
    const decoded = await roundTripStream(codec, [value]);

    // 検証
    expect(decoded).toStrictEqual([value]);
  });

  test("ルートの関数を含むチャンクは SuperjsonUnsupportedValueError で拒否される", async ({
    expect,
  }) => {
    // 準備
    const codec = new Superjson();

    // 実行
    const encoded = await pumpEncode(codec, [{ ok: true }, () => 1]);

    // 検証
    expect(encoded.writeError ?? encoded.readError).toBeInstanceOf(SuperjsonUnsupportedValueError);
  });

  test("ルートのシンボルを含むチャンクは SuperjsonUnsupportedValueError で拒否される", async ({
    expect,
  }) => {
    // 準備
    const codec = new Superjson();

    // 実行
    const encoded = await pumpEncode(codec, [Symbol("root")]);

    // 検証
    expect(encoded.writeError ?? encoded.readError).toBeInstanceOf(SuperjsonUnsupportedValueError);
  });

  test("不正な行を含むストリームは SyntaxError で拒否される", async ({ expect }) => {
    // 準備
    const codec = new Superjson();
    const chunks = [new TextEncoder().encode("not json\n")];

    // 実行
    const decoded = await pumpDecode(codec, chunks);

    // 検証
    expect(decoded.writeError ?? decoded.readError).toBeInstanceOf(SyntaxError);
  });

  test("最終行が不正なら SyntaxError で拒否される", async ({ expect }) => {
    // 準備
    const codec = new Superjson();
    const chunks = [new TextEncoder().encode("not json")];

    // 実行
    const decoded = await pumpDecode(codec, chunks);

    // 検証
    expect(decoded.writeError ?? decoded.readError).toBeInstanceOf(SyntaxError);
  });

  test("不正な UTF-8 を含むストリームは TypeError で拒否される", async ({ expect }) => {
    // 準備
    const codec = new Superjson();
    const chunks = [Uint8Array.from([0xff, 0xfe, 0x0a])];

    // 実行
    const decoded = await pumpDecode(codec, chunks);

    // 検証
    expect(decoded.writeError ?? decoded.readError).toBeInstanceOf(TypeError);
  });

  test("encodeStream は上流のエラーを下流の read に伝える", async ({ expect }) => {
    // 準備
    const codec = new Superjson();
    let sourceController!: ReadableStreamDefaultController<unknown>;
    const source = new ReadableStream<unknown>({
      start(controller) {
        sourceController = controller;
        controller.enqueue({ first: true });
      },
    });
    const c = createEncodeStreamContext(source);
    await codec.encodeStream(c as IMiddleware.EncodeStreamContext, createNext());
    const reader = (c.destination as ReadableStream<unknown>).getReader();
    await reader.read();

    // 実行
    const reason = new Error("abort");
    sourceController.error(reason);

    // 検証
    await expect(reader.read()).rejects.toBe(reason);
  });

  test("decodeStream は下流の cancel 後に読み取りが終了する", async ({ expect }) => {
    // 準備
    const codec = new Superjson();
    const c = createDecodeStreamContext(sourceFrom([toLines(["{}"])]));
    await codec.decodeStream(c as IMiddleware.DecodeStreamContext, createNext());
    const reader = (c.destination as ReadableStream<unknown>).getReader();
    const reason = new Error("cancel");

    // 実行
    await reader.cancel(reason);

    // 検証
    await expect(reader.read()).resolves.toStrictEqual({ done: true, value: undefined });
  });
});
