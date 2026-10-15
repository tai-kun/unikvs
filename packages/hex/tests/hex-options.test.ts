import type { IMiddleware } from "@unikvs/core";
import {
  concatBytes,
  createDecodeContext,
  createDecodeStreamContext,
  createEncodeContext,
  createEncodeStreamContext,
  createNext,
  sourceFrom,
} from "@unikvs/testing";
import { FastUtf8 } from "fast-utf8";
import { describe, test } from "vitest";

import { HexDecodeError } from "../src/errors.js";
import Hex, { type HexOptions } from "../src/hex.js";

const textEncoder = new TextEncoder();

/**
 * バイト列をエンコードして返します。
 */
async function encode(
  target: Hex,
  data: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const c = createEncodeContext(data);
  await target.encode(
    c as IMiddleware.EncodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
    createNext(),
  );

  return c.destination;
}

/**
 * hex 化されたバイト列をデコードして返します。
 */
async function decode(
  target: Hex,
  data: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const c = createDecodeContext(data);
  await target.decode(
    c as IMiddleware.DecodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
    createNext(),
  );

  return c.destination;
}

/**
 * 読み取り中に起きたエラーを握り潰さずに観測しつつ、読み取れたデータをすべて集めます。
 * ストリームの読み取り時のエラーを検証するために使用します。
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
 * チャンク列をエンコードストリームに流し、出力されたチャンクを返します。
 */
function pumpEncode(
  target: Hex,
  chunks: readonly Uint8Array<ArrayBuffer>[],
): Promise<{
  outputChunks: Uint8Array<ArrayBuffer>[];
  writeError: undefined;
  readError: unknown;
}> {
  const c = createEncodeStreamContext(sourceFrom(chunks));

  return target
    .encodeStream(
      c as IMiddleware.EncodeStreamContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
      createNext(),
    )
    .then(() => collectSettled(c.destination as ReadableStream<Uint8Array<ArrayBuffer>>));
}

/**
 * チャンク列をデコードストリームに流し、出力されたチャンクを返します。
 */
function pumpDecode(
  target: Hex,
  chunks: readonly Uint8Array<ArrayBuffer>[],
): Promise<{
  outputChunks: Uint8Array<ArrayBuffer>[];
  writeError: undefined;
  readError: unknown;
}> {
  const c = createDecodeStreamContext(sourceFrom(chunks));

  return target
    .decodeStream(
      c as IMiddleware.DecodeStreamContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
      createNext(),
    )
    .then(() => collectSettled(c.destination as ReadableStream<Uint8Array<ArrayBuffer>>));
}

describe("コンストラクター注入", () => {
  test("空のオプションでは既定と等価に往復できる", async ({ expect }) => {
    // 準備
    const options: HexOptions = {};
    const target = new Hex(options);
    const input = Uint8Array.from([0xde, 0xad, 0xbe, 0xef]);

    // 実行
    const output = await decode(target, await encode(target, input));

    // 検証
    expect(output).toStrictEqual(input);
    expect(target.name).toBe("Hex");
  });

  test("注入した encoder で一括 encode できる", async ({ expect }) => {
    // 準備
    const target = new Hex({
      encoder: new FastUtf8({ strict: false, allocateSize: 64, caching: false }),
    });
    const input = Uint8Array.from([0xde, 0xad, 0xbe, 0xef]);

    // 実行
    const encoded = await encode(target, input);

    // 検証
    expect(encoded).toStrictEqual(await encode(new Hex(), input));
    expect(await decode(target, encoded)).toStrictEqual(input);
  });

  test("注入した encoder はストリームの encode にも使われる", async ({ expect }) => {
    // 準備
    const target = new Hex({
      encoder: new FastUtf8({ strict: false, allocateSize: 64, caching: false }),
    });
    const input = Uint8Array.from([0xde, 0xad, 0xbe, 0xef]);

    // 実行
    const result = await pumpEncode(target, [input]);

    // 検証
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(concatBytes(result.outputChunks)).toStrictEqual(await encode(new Hex(), input));
  });

  test("注入した decoder で一括 decode できる", async ({ expect }) => {
    // 準備
    const target = new Hex({ decoder: new FastUtf8({ strict: true, caching: false }) });

    // 実行と検証
    expect(await decode(target, textEncoder.encode("deadbeef"))).toStrictEqual(
      Uint8Array.from([0xde, 0xad, 0xbe, 0xef]),
    );
    await expect(decode(target, Uint8Array.from([0xff]))).rejects.toThrow(TypeError);
    await expect(decode(target, Uint8Array.from([0xff]))).rejects.not.toThrow(HexDecodeError);
  });

  test("非 strict の decoder 注入時は一括の不正 UTF-8 が HexDecodeError になる", async ({
    expect,
  }) => {
    // 準備
    const target = new Hex({ decoder: new FastUtf8({ strict: false }) });

    // 実行
    let thrown: unknown;
    try {
      await decode(target, Uint8Array.from([0xff]));
    } catch (error) {
      thrown = error;
    }

    // 検証
    expect(thrown).toBeInstanceOf(HexDecodeError);
    expect(thrown).not.toBeInstanceOf(TypeError);
  });

  test("ストリームは注入した decoder の strict 設定を引き継ぐ", async ({ expect }) => {
    // 準備
    const target = new Hex({ decoder: new FastUtf8({ strict: false }) });
    const invalid = Uint8Array.from([0x31, 0x0a, 0xff, 0x0a]);

    // 実行
    const result = await pumpDecode(target, [invalid]);
    const error = result.writeError ?? result.readError;

    // 検証
    expect(error).toBeInstanceOf(HexDecodeError);
    expect(error).not.toBeInstanceOf(TypeError);
  });

  test("ストリームは ignoreBOM を引き継がず BOM 単体は空成功する", async ({ expect }) => {
    // 準備
    const target = new Hex({
      decoder: new FastUtf8({ strict: true, ignoreBOM: true }),
    });
    const bom = Uint8Array.from([0xef, 0xbb, 0xbf]);

    // 実行
    const single = await pumpDecode(target, [bom]);

    // 検証
    expect(single.writeError).toBeUndefined();
    expect(single.readError).toBeUndefined();
    expect(single.outputChunks).toStrictEqual([]);
  });

  test("並行する 2 つのデコードストリームは互いに干渉しない", async ({ expect }) => {
    // 準備
    const target = new Hex({ decoder: new FastUtf8({ strict: true }) });

    // 実行
    // A のマルチバイト前半と後半を別チャンクで流し、B の確定分と並行してデコードします。
    const [resultA, resultB] = await Promise.all([
      pumpDecode(target, [new Uint8Array([0xc3]), new Uint8Array([0xa9])]),
      pumpDecode(target, [textEncoder.encode("ab")]),
    ]);

    // 検証
    // A は é を再結合して奇数残りになるため HexDecodeError で失敗します。
    expect(resultA.writeError ?? resultA.readError).toBeInstanceOf(HexDecodeError);
    expect(resultA.writeError ?? resultA.readError).not.toBeInstanceOf(TypeError);
    expect(resultB.writeError ?? resultB.readError).toBeUndefined();
    expect(concatBytes(resultB.outputChunks)).toStrictEqual(Uint8Array.from([0xab]));
    expect(resultA.outputChunks).toStrictEqual([]);
  });
});
