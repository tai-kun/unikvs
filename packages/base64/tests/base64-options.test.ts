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

import Base64, { type Base64Options } from "../src/base64.js";
import { Base64DecodeError } from "../src/errors.js";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

type ByteContext = IMiddleware.EncodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>;
type ByteDecodeContext = IMiddleware.DecodeContext<
  Uint8Array<ArrayBuffer>,
  Uint8Array<ArrayBuffer>
>;
type ByteEncodeStreamContext = IMiddleware.EncodeStreamContext<
  Uint8Array<ArrayBuffer>,
  Uint8Array<ArrayBuffer>
>;
type ByteDecodeStreamContext = IMiddleware.DecodeStreamContext<
  Uint8Array<ArrayBuffer>,
  Uint8Array<ArrayBuffer>
>;

/**
 * バイト列をエンコードして返します。
 */
async function encode(
  target: Base64,
  data: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const c = createEncodeContext(data);
  await target.encode(c as ByteContext, createNext());

  return c.destination;
}

/**
 * base64 化されたバイト列をデコードして返します。
 */
async function decode(
  target: Base64,
  data: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const c = createDecodeContext(data);
  await target.decode(c as ByteDecodeContext, createNext());

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
  target: Base64,
  chunks: readonly Uint8Array<ArrayBuffer>[],
): Promise<{
  outputChunks: Uint8Array<ArrayBuffer>[];
  writeError: undefined;
  readError: unknown;
}> {
  const c = createEncodeStreamContext(sourceFrom(chunks));

  return target
    .encodeStream(c as ByteEncodeStreamContext, createNext())
    .then(() => collectSettled(c.destination as ReadableStream<Uint8Array<ArrayBuffer>>));
}

/**
 * チャンク列をデコードストリームに流し、出力されたチャンクを返します。
 */
function pumpDecode(
  target: Base64,
  chunks: readonly Uint8Array<ArrayBuffer>[],
): Promise<{
  outputChunks: Uint8Array<ArrayBuffer>[];
  writeError: undefined;
  readError: unknown;
}> {
  const c = createDecodeStreamContext(sourceFrom(chunks));

  return target
    .decodeStream(c as ByteDecodeStreamContext, createNext())
    .then(() => collectSettled(c.destination as ReadableStream<Uint8Array<ArrayBuffer>>));
}

describe("コンストラクター注入", () => {
  test("空のオプションでは既定と等価に往復できる", async ({ expect }) => {
    // 準備
    const options: Base64Options = {};
    const target = new Base64(options);
    const input = Uint8Array.from([0xfb, 0xff]);

    // 実行
    const output = await decode(target, await encode(target, input));

    // 検証
    expect(output).toStrictEqual(input);
    expect(target.name).toBe("Base64");
  });

  test("padding の既定は付与であり明示 true と等価である", async ({ expect }) => {
    // 準備
    const input = Uint8Array.from([0x66]);

    // 実行
    const omitted = await encode(new Base64(), input);
    const explicit = await encode(new Base64({ padding: true }), input);

    // 検証
    expect(textDecoder.decode(omitted)).toBe("Zg==");
    expect(omitted).toStrictEqual(explicit);
  });

  test("padding が false なら = を省略する", async ({ expect }) => {
    // 準備
    const target = new Base64({ padding: false });

    // 実行と検証
    expect(textDecoder.decode(await encode(target, Uint8Array.from([0x66])))).toBe("Zg");
    expect(textDecoder.decode(await encode(target, Uint8Array.from([0x66, 0x6f])))).toBe("Zm8");
    expect(textDecoder.decode(await encode(target, Uint8Array.from([0x66, 0x6f, 0x6f])))).toBe(
      "Zm9v",
    );
  });

  test("padding 設定にかかわらず decode は両方を受理する", async ({ expect }) => {
    // 準備
    const unpadded = new Base64({ padding: false });
    const padded = new Base64();

    // 実行と検証
    expect(await decode(unpadded, textEncoder.encode("Zg"))).toStrictEqual(Uint8Array.from([0x66]));
    expect(await decode(unpadded, textEncoder.encode("Zg=="))).toStrictEqual(
      Uint8Array.from([0x66]),
    );
    expect(await decode(padded, textEncoder.encode("Zg"))).toStrictEqual(Uint8Array.from([0x66]));
    expect(await decode(padded, textEncoder.encode("Zg=="))).toStrictEqual(Uint8Array.from([0x66]));
  });

  test("注入した encoder で一括 encode できる", async ({ expect }) => {
    // 準備
    const target = new Base64({
      encoder: new FastUtf8({ strict: false, allocateSize: 64, caching: false }),
    });
    const input = Uint8Array.from([0xfb, 0xff]);

    // 実行
    const encoded = await encode(target, input);

    // 検証
    expect(encoded).toStrictEqual(await encode(new Base64(), input));
    expect(await decode(target, encoded)).toStrictEqual(input);
  });

  test("注入した encoder はストリームの encode にも使われる", async ({ expect }) => {
    // 準備
    const target = new Base64({
      encoder: new FastUtf8({ strict: false, allocateSize: 64, caching: false }),
    });
    const input = Uint8Array.from([0xfb, 0xff]);

    // 実行
    const result = await pumpEncode(target, [input]);

    // 検証
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(concatBytes(result.outputChunks)).toStrictEqual(await encode(new Base64(), input));
  });

  test("padding 注入時はストリームの encode にも反映される", async ({ expect }) => {
    // 準備
    const target = new Base64({ padding: false });
    const input = Uint8Array.from([0x66]);

    // 実行
    const result = await pumpEncode(target, [input]);

    // 検証
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(textDecoder.decode(concatBytes(result.outputChunks))).toBe("Zg");
  });

  test("注入した decoder で一括 decode できる", async ({ expect }) => {
    // 準備
    const target = new Base64({ decoder: new FastUtf8({ strict: true, caching: false }) });

    // 実行と検証
    expect(await decode(target, textEncoder.encode("Zm9v"))).toStrictEqual(
      Uint8Array.from([0x66, 0x6f, 0x6f]),
    );
    await expect(decode(target, Uint8Array.from([0xff]))).rejects.toThrow(TypeError);
    await expect(decode(target, Uint8Array.from([0xff]))).rejects.not.toThrow(Base64DecodeError);
  });

  test("非 strict の decoder 注入時は一括の不正 UTF-8 が Base64DecodeError になる", async ({
    expect,
  }) => {
    // 準備
    const target = new Base64({ decoder: new FastUtf8({ strict: false }) });

    // 実行
    let thrown: unknown;
    try {
      await decode(target, Uint8Array.from([0xff]));
    } catch (error) {
      thrown = error;
    }

    // 検証
    expect(thrown).toBeInstanceOf(Base64DecodeError);
    expect(thrown).not.toBeInstanceOf(TypeError);
  });

  test("ストリームは注入した decoder の strict 設定を引き継ぐ", async ({ expect }) => {
    // 準備
    const target = new Base64({ decoder: new FastUtf8({ strict: false }) });
    const invalid = Uint8Array.from([0x31, 0x0a, 0xff, 0x0a]);

    // 実行
    const result = await pumpDecode(target, [invalid]);
    const error = result.writeError ?? result.readError;

    // 検証
    expect(error).toBeInstanceOf(Base64DecodeError);
    expect(error).not.toBeInstanceOf(TypeError);
  });

  test("ストリームは ignoreBOM を引き継がず BOM 単体は空成功する", async ({ expect }) => {
    // 準備
    const target = new Base64({
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
    const target = new Base64({ decoder: new FastUtf8({ strict: true }) });

    // 実行
    // A のマルチバイト前半と後半を別チャンクで流し、B の確定分と並行してデコードします。
    const [resultA, resultB] = await Promise.all([
      pumpDecode(target, [new Uint8Array([0xc3]), new Uint8Array([0xa9])]),
      pumpDecode(target, [textEncoder.encode("ab")]),
    ]);

    // 検証
    // A は é を再結合して alphabet 外になるため Base64DecodeError で失敗します。
    expect(resultA.writeError ?? resultA.readError).toBeInstanceOf(Base64DecodeError);
    expect(resultA.writeError ?? resultA.readError).not.toBeInstanceOf(TypeError);
    expect(resultB.writeError ?? resultB.readError).toBeUndefined();
    expect(concatBytes(resultB.outputChunks)).toStrictEqual(Uint8Array.from([0x69]));
    expect(resultA.outputChunks).toStrictEqual([]);
  });
});
