import { describe, test } from "vitest";

import { HexDecodeError } from "../src/errors.js";
import Hex from "../src/hex.js";
import { concatBytes, pumpThrough, readAll, sourceFrom, splitIntoChunks } from "./helpers.js";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

describe("getEncodable", () => {
  test("各チャンクを独立に hex 化する", async ({ expect }) => {
    // 準備
    const hex = new Hex();
    const chunks: Uint8Array<ArrayBuffer>[] = [
      Uint8Array.from([0xde, 0xad]),
      Uint8Array.from([0xbe, 0xef]),
      Uint8Array.from([0x00, 0xff]),
    ];

    // 実行
    const result = await pumpThrough(hex.getEncodable(), chunks);
    const expected = hex.encode({ data: concatBytes(chunks) });

    // 検証
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(concatBytes(result.outputChunks)).toStrictEqual(expected);
  });

  test("空のストリームは空の出力になる", async ({ expect }) => {
    // 準備
    const hex = new Hex();

    // 実行
    const result = await pumpThrough(hex.getEncodable(), []);

    // 検証
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(result.outputChunks).toStrictEqual([]);
  });

  test("空チャンクは無視される", async ({ expect }) => {
    // 準備
    const hex = new Hex();
    const chunks: Uint8Array<ArrayBuffer>[] = [
      new Uint8Array(0),
      Uint8Array.from([0xde, 0xad]),
      new Uint8Array(0),
    ];

    // 実行
    const result = await pumpThrough(hex.getEncodable(), chunks);

    // 検証
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(textDecoder.decode(concatBytes(result.outputChunks))).toBe("dead");
  });

  test("1 MiB を不揃い分割しても encode できる", async ({ expect }) => {
    // 準備
    const hex = new Hex();
    const input = new Uint8Array(1024 * 1024);
    for (let index = 0; index < input.length; index++) {
      input[index] = index % 251;
    }
    const chunks: Uint8Array<ArrayBuffer>[] = [
      input.subarray(0, 13),
      input.subarray(13, 4097),
      input.subarray(4097, input.length - 1),
      input.subarray(input.length - 1),
    ];

    // 実行
    const result = await pumpThrough(hex.getEncodable(), chunks);

    // 検証
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(concatBytes(result.outputChunks)).toStrictEqual(hex.encode({ data: input }));
  });
});

describe("getDecodable", () => {
  test("複数の値をデコードする", async ({ expect }) => {
    // 準備
    const hex = new Hex();
    const input = textEncoder.encode("deadbeef00ff");

    // 実行
    const result = await pumpThrough(hex.getDecodable(), [input]);

    // 検証
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(concatBytes(result.outputChunks)).toStrictEqual(
      Uint8Array.from([0xde, 0xad, 0xbe, 0xef, 0x00, 0xff]),
    );
  });

  test("1 バイトずつ分割してもデコードできる", async ({ expect }) => {
    // 準備
    const hex = new Hex();
    const input = Uint8Array.from([0xde, 0xad, 0xbe, 0xef, 0x01, 0x23]);
    const encoded = hex.encode({ data: input });

    // 実行
    const result = await pumpThrough(hex.getDecodable(), splitIntoChunks(encoded, 1));

    // 検証
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(concatBytes(result.outputChunks)).toStrictEqual(input);
  });

  test("不揃いな境界で分割してもデコードできる", async ({ expect }) => {
    // 準備
    const hex = new Hex();
    const input = Uint8Array.from([0xde, 0xad, 0xbe, 0xef, 0x01, 0x23, 0x45, 0x67]);
    const encoded = hex.encode({ data: input });

    // 実行と検証
    for (const size of [1, 2, 3, 5, 7, 13, 64]) {
      const result = await pumpThrough(hex.getDecodable(), splitIntoChunks(encoded, size));
      expect(result.writeError, `size=${size}`).toBeUndefined();
      expect(result.readError, `size=${size}`).toBeUndefined();
      expect(concatBytes(result.outputChunks), `size=${size}`).toStrictEqual(input);
    }
  });

  test("奇数分割をまたいでデコードできる", async ({ expect }) => {
    // 準備
    const hex = new Hex();
    const input = Uint8Array.from([0xde, 0xad, 0xbe, 0xef]);
    const encoded = hex.encode({ data: input });

    // 実行
    const shifted = await pumpThrough(hex.getDecodable(), [
      encoded.subarray(0, 1),
      encoded.subarray(1, 3),
      encoded.subarray(3),
    ]);
    const random = await pumpThrough(hex.getDecodable(), [
      encoded.subarray(0, 3),
      encoded.subarray(3, 4),
      encoded.subarray(4),
    ]);

    // 検証
    expect(shifted.writeError).toBeUndefined();
    expect(shifted.readError).toBeUndefined();
    expect(concatBytes(shifted.outputChunks)).toStrictEqual(input);
    expect(random.writeError).toBeUndefined();
    expect(random.readError).toBeUndefined();
    expect(concatBytes(random.outputChunks)).toStrictEqual(input);
  });

  test("大文字と混在をチャンク分割してもデコードできる", async ({ expect }) => {
    // 準備
    const hex = new Hex();
    const expected = Uint8Array.from([0xde, 0xad, 0xbe, 0xef]);

    // 実行
    const upper = await pumpThrough(
      hex.getDecodable(),
      splitIntoChunks(textEncoder.encode("DEADBEEF"), 3),
    );
    const mixed = await pumpThrough(
      hex.getDecodable(),
      splitIntoChunks(textEncoder.encode("DeAdBeEf"), 1),
    );

    // 検証
    expect(upper.writeError).toBeUndefined();
    expect(upper.readError).toBeUndefined();
    expect(concatBytes(upper.outputChunks)).toStrictEqual(expected);
    expect(mixed.writeError).toBeUndefined();
    expect(mixed.readError).toBeUndefined();
    expect(concatBytes(mixed.outputChunks)).toStrictEqual(expected);
  });

  test("空のストリームは値を出力しない", async ({ expect }) => {
    // 準備
    const hex = new Hex();

    // 実行
    const empty = await pumpThrough(hex.getDecodable(), []);
    const zeroBytes = await pumpThrough(hex.getDecodable(), [new Uint8Array(0)]);

    // 検証
    expect(empty.writeError).toBeUndefined();
    expect(empty.readError).toBeUndefined();
    expect(empty.outputChunks).toStrictEqual([]);
    expect(zeroBytes.writeError).toBeUndefined();
    expect(zeroBytes.readError).toBeUndefined();
    expect(zeroBytes.outputChunks).toStrictEqual([]);
  });

  test("奇数長で終わるストリームは HexDecodeError で失敗する", async ({ expect }) => {
    // 準備
    const hex = new Hex();

    // 実行
    const result = await pumpThrough(hex.getDecodable(), [textEncoder.encode("abc")]);

    // 検証
    expect(result.writeError ?? result.readError).toBeInstanceOf(HexDecodeError);
  });

  test("不正文字を含むストリームは HexDecodeError で失敗する", async ({ expect }) => {
    // 準備
    const hex = new Hex();

    // 実行
    const result = await pumpThrough(hex.getDecodable(), [textEncoder.encode("zz")]);

    // 検証
    expect(result.writeError ?? result.readError).toBeInstanceOf(HexDecodeError);
  });

  test("不正な UTF-8 を流すと TypeError で失敗する", async ({ expect }) => {
    // 準備
    const hex = new Hex();
    const invalid = Uint8Array.from([0x31, 0x0a, 0xff, 0x0a]);

    // 実行
    const result = await pumpThrough(hex.getDecodable(), [invalid]);

    // 検証
    expect(result.writeError ?? result.readError).toBeInstanceOf(TypeError);
  });

  test("前半だけで終わるストリームは TypeError で失敗する", async ({ expect }) => {
    // 準備
    const hex = new Hex();
    const truncated = Uint8Array.from([0xe3]);

    // 実行
    const result = await pumpThrough(hex.getDecodable(), [truncated]);

    // 検証
    expect(result.writeError ?? result.readError).toBeInstanceOf(TypeError);
    expect(result.writeError ?? result.readError).not.toBeInstanceOf(HexDecodeError);
  });

  test("大きな値をチャンク境界をまたいでデコードできる", async ({ expect }) => {
    // 準備
    const hex = new Hex();
    const input = new Uint8Array(256 * 1024);
    for (let index = 0; index < input.length; index++) {
      input[index] = index % 251;
    }
    const encoded = hex.encode({ data: input });

    // 実行
    const result = await pumpThrough(hex.getDecodable(), splitIntoChunks(encoded, 7));

    // 検証
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(concatBytes(result.outputChunks)).toStrictEqual(input);
  });
});

describe("ストリームの往復", () => {
  test("pipeThrough で encode と decode を往復すると元の値に戻る", async ({ expect }) => {
    // 準備
    const hex = new Hex();
    const chunks: Uint8Array<ArrayBuffer>[] = [
      Uint8Array.from([0xde, 0xad, 0xbe, 0xef]),
      Uint8Array.from([0x00, 0x01, 0x02]),
      Uint8Array.from([0xff]),
    ];

    // 実行
    const decoded = await readAll(
      sourceFrom(chunks).pipeThrough(hex.getEncodable()).pipeThrough(hex.getDecodable()),
    );

    // 検証
    expect(concatBytes(decoded)).toStrictEqual(concatBytes(chunks));
  });

  test("出力チャンクの連結を一括 decode すると元の値に戻る", async ({ expect }) => {
    // 準備
    const hex = new Hex();
    const input = Uint8Array.from([0xde, 0xad, 0xbe, 0xef, 0x00, 0xff]);

    // 実行
    const encoded = await pumpThrough(hex.getEncodable(), [input]);
    const decoded = hex.decode({ data: concatBytes(encoded.outputChunks) });

    // 検証
    expect(encoded.writeError).toBeUndefined();
    expect(encoded.readError).toBeUndefined();
    expect(decoded).toStrictEqual(input);
  });

  test("一括 encode した結果を小さなチャンクで decode できる", async ({ expect }) => {
    // 準備
    const hex = new Hex();
    const input = Uint8Array.from([0xde, 0xad, 0xbe, 0xef, 0x01, 0x23, 0x45]);

    // 実行
    const encoded = hex.encode({ data: input });
    const result = await pumpThrough(hex.getDecodable(), splitIntoChunks(encoded, 3));

    // 検証
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(concatBytes(result.outputChunks)).toStrictEqual(input);
  });
});
