import { describe, test } from "vitest";

import Compression from "../src/compression.js";
import {
  FORMATS,
  concatBytes,
  createPseudoRandomBytes,
  pumpThrough,
  readAll,
  sourceFrom,
  splitIntoChunks,
} from "./helpers.js";

describe.each(FORMATS)("%s 形式のストリーム", (format) => {
  test("空のストリームを圧縮して展開すると空のデータに戻る", async ({ expect }) => {
    // 準備
    const compression = new Compression(format);

    // 実行
    const encoded = await pumpThrough(compression.getEncodable(), []);
    const decoded = await compression.decode({ data: concatBytes(encoded.outputChunks) });

    // 検証
    expect(encoded.writeError).toBeUndefined();
    expect(encoded.readError).toBeUndefined();
    expect(decoded).toStrictEqual(new Uint8Array(0));
  });

  test("1 チャンクのストリームを往復すると元のデータに戻る", async ({ expect }) => {
    // 準備
    const compression = new Compression(format);
    const input = createPseudoRandomBytes(1024, 11);

    // 実行
    const decodedChunks = await readAll(
      sourceFrom([input])
        .pipeThrough(compression.getEncodable())
        .pipeThrough(compression.getDecodable()),
    );

    // 検証
    expect(concatBytes(decodedChunks)).toStrictEqual(input);
  });

  test("大きさが不揃いな複数チャンクのストリームを往復すると元のデータに戻る", async ({
    expect,
  }) => {
    // 準備
    const compression = new Compression(format);
    const input = createPseudoRandomBytes(8192, 12);
    const chunks = [
      input.subarray(0, 13),
      input.subarray(13, 4097),
      input.subarray(4097, 8191),
      input.subarray(8191),
    ];

    // 実行
    const decodedChunks = await readAll(
      sourceFrom(chunks)
        .pipeThrough(compression.getEncodable())
        .pipeThrough(compression.getDecodable()),
    );

    // 検証
    expect(concatBytes(decodedChunks)).toStrictEqual(input);
  });

  test("100 個の小さなチャンクのストリームを往復すると元のデータに戻る", async ({ expect }) => {
    // 準備
    const compression = new Compression(format);
    const input = createPseudoRandomBytes(1000, 13);
    const chunks = Array.from({ length: 100 }, (_, index) =>
      input.subarray(index * 10, index * 10 + 10),
    );

    // 実行
    const decodedChunks = await readAll(
      sourceFrom(chunks)
        .pipeThrough(compression.getEncodable())
        .pipeThrough(compression.getDecodable()),
    );

    // 検証
    expect(concatBytes(decodedChunks)).toStrictEqual(input);
  });

  test("1 バイトずつ encode して 7 バイトずつ decode しても元のデータに戻る", async ({
    expect,
  }) => {
    // 準備
    const compression = new Compression(format);
    const input = createPseudoRandomBytes(512, 14);

    // 実行
    const encoded = await pumpThrough(compression.getEncodable(), splitIntoChunks(input, 1));
    const decoded = await pumpThrough(
      compression.getDecodable(),
      splitIntoChunks(concatBytes(encoded.outputChunks), 7),
    );

    // 検証
    expect(encoded.writeError).toBeUndefined();
    expect(encoded.readError).toBeUndefined();
    expect(decoded.writeError).toBeUndefined();
    expect(decoded.readError).toBeUndefined();
    expect(concatBytes(decoded.outputChunks)).toStrictEqual(input);
  });

  test("単体の encode 結果を小さなチャンクで展開しても元のデータに戻る", async ({ expect }) => {
    // 準備
    const compression = new Compression(format);
    const input = createPseudoRandomBytes(2048, 15);
    const encoded = await compression.encode({ data: input });

    // 実行
    const decoded = await pumpThrough(compression.getDecodable(), splitIntoChunks(encoded, 13));

    // 検証
    expect(decoded.writeError).toBeUndefined();
    expect(decoded.readError).toBeUndefined();
    expect(concatBytes(decoded.outputChunks)).toStrictEqual(input);
  });

  test("getEncodable の出力を単体の decode で展開すると元のデータに戻る", async ({ expect }) => {
    // 準備
    const compression = new Compression(format);
    const input = createPseudoRandomBytes(2048, 16);

    // 実行
    const encoded = await pumpThrough(compression.getEncodable(), [input]);
    const decoded = await compression.decode({ data: concatBytes(encoded.outputChunks) });

    // 検証
    expect(encoded.writeError).toBeUndefined();
    expect(encoded.readError).toBeUndefined();
    expect(decoded).toStrictEqual(input);
  });
});
