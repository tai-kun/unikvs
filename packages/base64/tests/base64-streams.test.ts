import { describe, test } from "vitest";

import Base64 from "../src/base64.js";
import { Base64DecodeError } from "../src/errors.js";
import { concatBytes, pumpThrough, readAll, sourceFrom, splitIntoChunks } from "./helpers.js";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

describe("getEncodable", () => {
  test("最終連結は一括 encode と一致する", async ({ expect }) => {
    // 準備
    const base64 = new Base64();
    const chunks: Uint8Array<ArrayBuffer>[] = [
      Uint8Array.from([0x66, 0x6f]),
      Uint8Array.from([0x6f, 0x62, 0x61]),
      Uint8Array.from([0x72]),
    ];

    // 実行
    const result = await pumpThrough(base64.getEncodable(), chunks);
    const expected = base64.encode({ data: concatBytes(chunks) });

    // 検証
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(concatBytes(result.outputChunks)).toStrictEqual(expected);
  });

  test("空のストリームは空の出力になる", async ({ expect }) => {
    // 準備
    const base64 = new Base64();

    // 実行
    const result = await pumpThrough(base64.getEncodable(), []);

    // 検証
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(result.outputChunks).toStrictEqual([]);
  });

  test("空チャンクは無視される", async ({ expect }) => {
    // 準備
    const base64 = new Base64();
    const chunks: Uint8Array<ArrayBuffer>[] = [
      new Uint8Array(0),
      Uint8Array.from([0x66]),
      new Uint8Array(0),
    ];

    // 実行
    const result = await pumpThrough(base64.getEncodable(), chunks);

    // 検証
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(textDecoder.decode(concatBytes(result.outputChunks))).toBe("Zg==");
  });

  test("1 バイトずつ分割しても encode できる", async ({ expect }) => {
    // 準備
    const base64 = new Base64();
    const input = Uint8Array.from([0x66, 0x6f, 0x6f, 0x62, 0x61, 0x72]);

    // 実行
    const result = await pumpThrough(base64.getEncodable(), splitIntoChunks(input, 1));

    // 検証
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(concatBytes(result.outputChunks)).toStrictEqual(base64.encode({ data: input }));
  });

  test("1 MiB を不揃い分割しても encode できる", async ({ expect }) => {
    // 準備
    const base64 = new Base64();
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
    const result = await pumpThrough(base64.getEncodable(), chunks);

    // 検証
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(concatBytes(result.outputChunks)).toStrictEqual(base64.encode({ data: input }));
  });

  test("3 の倍数長では flush で追加出力しない", async ({ expect }) => {
    // 準備
    const base64 = new Base64();
    const input = Uint8Array.from([0x66, 0x6f, 0x6f]);

    // 実行
    const result = await pumpThrough(base64.getEncodable(), [input]);

    // 検証
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(concatBytes(result.outputChunks)).toStrictEqual(base64.encode({ data: input }));
  });
});

describe("getDecodable", () => {
  test("複数の値をデコードする", async ({ expect }) => {
    // 準備
    const base64 = new Base64();
    const input = textEncoder.encode("Zm9vYmFy");

    // 実行
    const result = await pumpThrough(base64.getDecodable(), [input]);

    // 検証
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(concatBytes(result.outputChunks)).toStrictEqual(
      Uint8Array.from([0x66, 0x6f, 0x6f, 0x62, 0x61, 0x72]),
    );
  });

  test("1 バイトずつ分割してもデコードできる", async ({ expect }) => {
    // 準備
    const base64 = new Base64();
    const input = Uint8Array.from([0x66, 0x6f, 0x6f, 0x62, 0x61, 0x72]);
    const encoded = base64.encode({ data: input });

    // 実行
    const result = await pumpThrough(base64.getDecodable(), splitIntoChunks(encoded, 1));

    // 検証
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(concatBytes(result.outputChunks)).toStrictEqual(input);
  });

  test("不揃いな境界で分割してもデコードできる", async ({ expect }) => {
    // 準備
    const base64 = new Base64();
    const input = Uint8Array.from([0x66, 0x6f, 0x6f, 0x62, 0x61, 0x72, 0x00, 0xff]);
    const encoded = base64.encode({ data: input });

    // 実行と検証
    for (const size of [1, 2, 3, 5, 7, 13, 64]) {
      const result = await pumpThrough(base64.getDecodable(), splitIntoChunks(encoded, size));
      expect(result.writeError, `size=${size}`).toBeUndefined();
      expect(result.readError, `size=${size}`).toBeUndefined();
      expect(concatBytes(result.outputChunks), `size=${size}`).toStrictEqual(input);
    }
  });

  test("= ラン内分割をまたいでデコードできる", async ({ expect }) => {
    // 準備
    const base64 = new Base64();
    const expected = Uint8Array.from([0x66]);

    // 実行
    const first = await pumpThrough(base64.getDecodable(), [
      textEncoder.encode("Zg="),
      textEncoder.encode("="),
    ]);
    const second = await pumpThrough(base64.getDecodable(), [
      textEncoder.encode("Z"),
      textEncoder.encode("g=="),
    ]);
    const third = await pumpThrough(base64.getDecodable(), [
      textEncoder.encode("Zg"),
      textEncoder.encode("=="),
    ]);
    const fourth = await pumpThrough(base64.getDecodable(), [
      textEncoder.encode("Zm8"),
      textEncoder.encode("="),
    ]);

    // 検証
    expect(first.writeError).toBeUndefined();
    expect(first.readError).toBeUndefined();
    expect(concatBytes(first.outputChunks)).toStrictEqual(expected);
    expect(second.writeError).toBeUndefined();
    expect(second.readError).toBeUndefined();
    expect(concatBytes(second.outputChunks)).toStrictEqual(expected);
    expect(third.writeError).toBeUndefined();
    expect(third.readError).toBeUndefined();
    expect(concatBytes(third.outputChunks)).toStrictEqual(expected);
    expect(fourth.writeError).toBeUndefined();
    expect(fourth.readError).toBeUndefined();
    expect(concatBytes(fourth.outputChunks)).toStrictEqual(Uint8Array.from([0x66, 0x6f]));
  });

  test("単チャンクの付与形は空 enqueue なしでデコードできる", async ({ expect }) => {
    // 準備
    const base64 = new Base64();

    // 実行
    const result = await pumpThrough(base64.getDecodable(), [textEncoder.encode("Zg==")]);
    const long = await pumpThrough(base64.getDecodable(), [textEncoder.encode("Zm9vYmE=")]);

    // 検証
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(concatBytes(result.outputChunks)).toStrictEqual(Uint8Array.from([0x66]));
    for (const chunk of result.outputChunks) {
      expect(chunk.byteLength).toBeGreaterThan(0);
    }
    expect(long.writeError).toBeUndefined();
    expect(long.readError).toBeUndefined();
    expect(concatBytes(long.outputChunks)).toStrictEqual(
      Uint8Array.from([0x66, 0x6f, 0x6f, 0x62, 0x61]),
    );
  });

  test("付与形と省略形の混在をデコードできる", async ({ expect }) => {
    // 準備
    const base64 = new Base64();
    const input = Uint8Array.from([0x66, 0x6f, 0x6f, 0x62, 0x61, 0x72]);
    const unpadded = new Base64({ padding: false }).encode({ data: input });

    // 実行
    const result = await pumpThrough(base64.getDecodable(), splitIntoChunks(unpadded, 2));

    // 検証
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(concatBytes(result.outputChunks)).toStrictEqual(input);
  });

  test("空のストリームは値を出力しない", async ({ expect }) => {
    // 準備
    const base64 = new Base64();

    // 実行
    const empty = await pumpThrough(base64.getDecodable(), []);
    const zeroBytes = await pumpThrough(base64.getDecodable(), [new Uint8Array(0)]);

    // 検証
    expect(empty.writeError).toBeUndefined();
    expect(empty.readError).toBeUndefined();
    expect(empty.outputChunks).toStrictEqual([]);
    expect(zeroBytes.writeError).toBeUndefined();
    expect(zeroBytes.readError).toBeUndefined();
    expect(zeroBytes.outputChunks).toStrictEqual([]);
  });

  test("末尾に 1 文字だけ残るストリームは Base64DecodeError で失敗する", async ({ expect }) => {
    // 準備
    const base64 = new Base64();

    // 実行
    const result = await pumpThrough(base64.getDecodable(), [textEncoder.encode("a")]);

    // 検証
    expect(result.writeError ?? result.readError).toBeInstanceOf(Base64DecodeError);
  });

  test("不正文字を含むストリームは Base64DecodeError で失敗する", async ({ expect }) => {
    // 準備
    const base64 = new Base64();

    // 実行
    const first = await pumpThrough(base64.getDecodable(), [textEncoder.encode("ab-c")]);
    const second = await pumpThrough(base64.getDecodable(), [textEncoder.encode("ab=c")]);

    // 検証
    expect(first.writeError ?? first.readError).toBeInstanceOf(Base64DecodeError);
    expect(second.writeError ?? second.readError).toBeInstanceOf(Base64DecodeError);
  });

  test("= の後に追加データが来ると Base64DecodeError で失敗する", async ({ expect }) => {
    // 準備
    const base64 = new Base64();

    // 実行
    const first = await pumpThrough(base64.getDecodable(), [
      textEncoder.encode("Zg=="),
      textEncoder.encode("Zg"),
    ]);
    const second = await pumpThrough(base64.getDecodable(), [
      textEncoder.encode("Zg=="),
      textEncoder.encode("="),
    ]);
    const third = await pumpThrough(base64.getDecodable(), [textEncoder.encode("Zm8==")]);

    // 検証
    expect(first.writeError ?? first.readError).toBeInstanceOf(Base64DecodeError);
    expect(second.writeError ?? second.readError).toBeInstanceOf(Base64DecodeError);
    expect(third.writeError ?? third.readError).toBeInstanceOf(Base64DecodeError);
  });

  test("不正な UTF-8 を流すと TypeError で失敗する", async ({ expect }) => {
    // 準備
    const base64 = new Base64();
    const invalid = Uint8Array.from([0x31, 0x0a, 0xff, 0x0a]);

    // 実行
    const result = await pumpThrough(base64.getDecodable(), [invalid]);

    // 検証
    expect(result.writeError ?? result.readError).toBeInstanceOf(TypeError);
  });

  test("前半だけで終わるストリームは TypeError で失敗する", async ({ expect }) => {
    // 準備
    const base64 = new Base64();
    const truncated = Uint8Array.from([0xe3]);

    // 実行
    const result = await pumpThrough(base64.getDecodable(), [truncated]);

    // 検証
    expect(result.writeError ?? result.readError).toBeInstanceOf(TypeError);
    expect(result.writeError ?? result.readError).not.toBeInstanceOf(Base64DecodeError);
  });

  test("BOM 単体は空成功する", async ({ expect }) => {
    // 準備
    const base64 = new Base64();
    const bom = Uint8Array.from([0xef, 0xbb, 0xbf]);

    // 実行
    const result = await pumpThrough(base64.getDecodable(), [bom]);

    // 検証
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(result.outputChunks).toStrictEqual([]);
  });

  test("大きな値をチャンク境界をまたいでデコードできる", async ({ expect }) => {
    // 準備
    const base64 = new Base64();
    const input = new Uint8Array(256 * 1024);
    for (let index = 0; index < input.length; index++) {
      input[index] = index % 251;
    }
    const encoded = base64.encode({ data: input });

    // 実行
    const result = await pumpThrough(base64.getDecodable(), splitIntoChunks(encoded, 7));

    // 検証
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(concatBytes(result.outputChunks)).toStrictEqual(input);
  });
});

describe("ストリームの往復", () => {
  test("pipeThrough で encode と decode を往復すると元の値に戻る", async ({ expect }) => {
    // 準備
    const base64 = new Base64();
    const chunks: Uint8Array<ArrayBuffer>[] = [
      Uint8Array.from([0x66, 0x6f]),
      Uint8Array.from([0x6f, 0x62, 0x61]),
      Uint8Array.from([0xff]),
    ];

    // 実行
    const decoded = await readAll(
      sourceFrom(chunks).pipeThrough(base64.getEncodable()).pipeThrough(base64.getDecodable()),
    );

    // 検証
    expect(concatBytes(decoded)).toStrictEqual(concatBytes(chunks));
  });

  test("出力チャンクの連結を一括 decode すると元の値に戻る", async ({ expect }) => {
    // 準備
    const base64 = new Base64();
    const input = Uint8Array.from([0x66, 0x6f, 0x6f, 0x62, 0x61, 0x72, 0x00, 0xff]);

    // 実行
    const encoded = await pumpThrough(base64.getEncodable(), [input]);
    const decoded = base64.decode({ data: concatBytes(encoded.outputChunks) });

    // 検証
    expect(encoded.writeError).toBeUndefined();
    expect(encoded.readError).toBeUndefined();
    expect(decoded).toStrictEqual(input);
  });

  test("一括 encode した結果を小さなチャンクで decode できる", async ({ expect }) => {
    // 準備
    const base64 = new Base64();
    const input = Uint8Array.from([0x66, 0x6f, 0x6f, 0x62, 0x61, 0x72, 0x00]);

    // 実行
    const encoded = base64.encode({ data: input });
    const result = await pumpThrough(base64.getDecodable(), splitIntoChunks(encoded, 3));

    // 検証
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(concatBytes(result.outputChunks)).toStrictEqual(input);
  });
});
