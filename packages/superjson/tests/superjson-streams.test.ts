import { describe, test } from "vitest";

import { SuperjsonUnsupportedValueError } from "../src/errors.js";
import Superjson from "../src/superjson.js";
import {
  concatBytes,
  pumpThrough,
  readAll,
  sourceFromValues,
  splitIntoChunks,
  toText,
} from "./helpers.js";

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
 * 値の列をエンコードし、JSON Lines のバイト列へ変換します。
 */
async function encodeValues(
  codec: Superjson,
  values: readonly unknown[],
): Promise<Uint8Array<ArrayBuffer>> {
  const encoded = await pumpThrough(codec.getEncodable(), values);

  return concatBytes(encoded.outputChunks);
}

/**
 * 値の列を JSON Lines の文字列へ変換します。
 * 1 つの値を 1 行として扱い、行末に改行を付けます。
 */
function toLines(values: readonly string[], terminator = "\n"): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(`${values.join(terminator)}${terminator}`);
}

describe("Superjson のストリーム", () => {
  test("複数の値を JSONL として往復すると元に戻る", async ({ expect }) => {
    // 準備
    const codec = new Superjson();

    // 実行
    const decoded = await readAll(
      sourceFromValues(VALUES).pipeThrough(codec.getEncodable()).pipeThrough(codec.getDecodable()),
    );

    // 検証
    expect(decoded).toStrictEqual(VALUES);
  });

  test("getEncodable は 1 行 1 値の JSON Lines を出力する", async ({ expect }) => {
    // 準備
    const codec = new Superjson();

    // 実行
    const encoded = await pumpThrough(codec.getEncodable(), [{ a: 1 }, "text"]);

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
    const decoded = await pumpThrough(codec.getDecodable(), splitIntoChunks(encoded, 1));

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
    const decoded = await pumpThrough(codec.getDecodable(), chunks);

    // 検証
    expect(decoded.writeError).toBeUndefined();
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual(VALUES);
  });

  test("末尾に改行がある場合もない場合もデコードできる", async ({ expect }) => {
    // 準備
    const codec = new Superjson();
    const line = toText([codec.encode({ data: "value" })]);

    // 実行
    const withNewline = await pumpThrough(codec.getDecodable(), [toLines([line])]);
    const withoutNewline = await pumpThrough(codec.getDecodable(), [
      new TextEncoder().encode(line),
    ]);

    // 検証
    expect(withNewline.readError).toBeUndefined();
    expect(withoutNewline.readError).toBeUndefined();
    expect(withNewline.outputChunks).toStrictEqual(["value"]);
    expect(withoutNewline.outputChunks).toStrictEqual(["value"]);
  });

  test("CRLF の改行を受け付ける", async ({ expect }) => {
    // 準備
    const codec = new Superjson();
    const first = toText([codec.encode({ data: "first" })]);
    const second = toText([codec.encode({ data: { second: true } })]);

    // 実行
    const decoded = await pumpThrough(codec.getDecodable(), [toLines([first, second], "\r\n")]);

    // 検証
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual(["first", { second: true }]);
  });

  test("空行はスキップする", async ({ expect }) => {
    // 準備
    const codec = new Superjson();
    const first = toText([codec.encode({ data: 1 })]);
    const second = toText([codec.encode({ data: 2 })]);
    const text = `\n${first}\n\n\r\n${second}\n`;

    // 実行
    const decoded = await pumpThrough(codec.getDecodable(), [new TextEncoder().encode(text)]);

    // 検証
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual([1, 2]);
  });

  test("空のストリームは値を 1 つも返さない", async ({ expect }) => {
    // 準備
    const codec = new Superjson();

    // 実行
    const encoded = await pumpThrough(codec.getEncodable(), []);
    const decoded = await pumpThrough(codec.getDecodable(), []);

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
    const decoded = await pumpThrough(codec.getDecodable(), [codec.encode({ data: value })]);

    // 検証
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual([value]);
  });

  test("ストリーム encode の出力を一括 decode できる", async ({ expect }) => {
    // 準備
    const codec = new Superjson();
    const value = { list: [1, 2, 3] };

    // 実行
    const encoded = await pumpThrough(codec.getEncodable(), [value]);
    const decoded = codec.decode({ data: concatBytes(encoded.outputChunks) });

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
    const decoded = await readAll(
      sourceFromValues([value]).pipeThrough(codec.getEncodable()).pipeThrough(codec.getDecodable()),
    );

    // 検証
    expect(decoded).toStrictEqual([value]);
  });

  test("ルートの関数を含むチャンクは SuperjsonUnsupportedValueError で拒否される", async ({
    expect,
  }) => {
    // 準備
    const codec = new Superjson();

    // 実行
    const encoded = await pumpThrough(codec.getEncodable(), [{ ok: true }, () => 1]);

    // 検証
    expect(encoded.writeError ?? encoded.readError).toBeInstanceOf(SuperjsonUnsupportedValueError);
  });

  test("ルートのシンボルを含むチャンクは SuperjsonUnsupportedValueError で拒否される", async ({
    expect,
  }) => {
    // 準備
    const codec = new Superjson();

    // 実行
    const encoded = await pumpThrough(codec.getEncodable(), [Symbol("root")]);

    // 検証
    expect(encoded.writeError ?? encoded.readError).toBeInstanceOf(SuperjsonUnsupportedValueError);
  });

  test("不正な行を含むストリームは SyntaxError で拒否される", async ({ expect }) => {
    // 準備
    const codec = new Superjson();
    const chunks = [new TextEncoder().encode("not json\n")];

    // 実行
    const decoded = await pumpThrough(codec.getDecodable(), chunks);

    // 検証
    expect(decoded.writeError ?? decoded.readError).toBeInstanceOf(SyntaxError);
  });

  test("最終行が不正なら SyntaxError で拒否される", async ({ expect }) => {
    // 準備
    const codec = new Superjson();
    const chunks = [new TextEncoder().encode("not json")];

    // 実行
    const decoded = await pumpThrough(codec.getDecodable(), chunks);

    // 検証
    expect(decoded.writeError ?? decoded.readError).toBeInstanceOf(SyntaxError);
  });

  test("不正な UTF-8 を含むストリームは TypeError で拒否される", async ({ expect }) => {
    // 準備
    const codec = new Superjson();
    const chunks = [Uint8Array.from([0xff, 0xfe, 0x0a])];

    // 実行
    const decoded = await pumpThrough(codec.getDecodable(), chunks);

    // 検証
    expect(decoded.writeError ?? decoded.readError).toBeInstanceOf(TypeError);
  });

  test("getEncodable の writable を abort すると readable が拒否される", async ({ expect }) => {
    // 準備
    const codec = new Superjson();
    const { writable, readable } = codec.getEncodable();
    const writer = writable.getWriter();
    const reader = readable.getReader();
    const reason = new Error("abort");

    // 実行
    const pending = reader.read();
    await writer.abort(reason);

    // 検証
    await expect(pending).rejects.toBe(reason);
  });

  test("getDecodable の readable を cancel すると writable が拒否される", async ({ expect }) => {
    // 準備
    const codec = new Superjson();
    const { writable, readable } = codec.getDecodable();
    const writer = writable.getWriter();
    const reader = readable.getReader();
    const reason = new Error("cancel");

    // 実行
    await reader.cancel(reason);

    // 検証
    await expect(writer.write(toLines(["{}"]))).rejects.toBe(reason);
  });
});
