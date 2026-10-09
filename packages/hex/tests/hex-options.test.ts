import { describe, test } from "vitest";
import { FastUtf8 } from "fast-utf8";

import { HexDecodeError } from "../src/errors.js";
import Hex, { type HexOptions } from "../src/hex.js";
import { concatBytes, pumpThrough, readAll } from "./helpers.js";

const textEncoder = new TextEncoder();

describe("コンストラクター注入", () => {
  test("空のオプションでは既定と等価に往復できる", ({ expect }) => {
    // 準備
    const options: HexOptions = {};
    const target = new Hex(options);
    const input = Uint8Array.from([0xde, 0xad, 0xbe, 0xef]);

    // 実行
    const output = target.decode({ data: target.encode({ data: input }) });

    // 検証
    expect(output).toStrictEqual(input);
    expect(target.name).toBe("Hex");
  });

  test("注入した encoder で一括 encode できる", ({ expect }) => {
    // 準備
    const target = new Hex({
      encoder: new FastUtf8({ strict: false, allocateSize: 64, caching: false }),
    });
    const input = Uint8Array.from([0xde, 0xad, 0xbe, 0xef]);

    // 実行
    const encoded = target.encode({ data: input });

    // 検証
    expect(encoded).toStrictEqual(new Hex().encode({ data: input }));
    expect(target.decode({ data: encoded })).toStrictEqual(input);
  });

  test("注入した encoder はストリームの encode にも使われる", async ({ expect }) => {
    // 準備
    const target = new Hex({
      encoder: new FastUtf8({ strict: false, allocateSize: 64, caching: false }),
    });
    const input = Uint8Array.from([0xde, 0xad, 0xbe, 0xef]);

    // 実行
    const result = await pumpThrough(target.getEncodable(), [input]);

    // 検証
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(concatBytes(result.outputChunks)).toStrictEqual(new Hex().encode({ data: input }));
  });

  test("注入した decoder で一括 decode できる", ({ expect }) => {
    // 準備
    const target = new Hex({ decoder: new FastUtf8({ strict: true, caching: false }) });

    // 実行と検証
    expect(target.decode({ data: textEncoder.encode("deadbeef") })).toStrictEqual(
      Uint8Array.from([0xde, 0xad, 0xbe, 0xef]),
    );
    expect(() => target.decode({ data: Uint8Array.from([0xff]) })).toThrow(TypeError);
    expect(() => target.decode({ data: Uint8Array.from([0xff]) })).not.toThrow(HexDecodeError);
  });

  test("非 strict の decoder 注入時は一括の不正 UTF-8 が HexDecodeError になる", ({ expect }) => {
    // 準備
    const target = new Hex({ decoder: new FastUtf8({ strict: false }) });

    // 実行
    let thrown: unknown;
    try {
      target.decode({ data: Uint8Array.from([0xff]) });
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
    const result = await pumpThrough(target.getDecodable(), [invalid]);
    const error = result.writeError ?? result.readError;

    // 検証
    expect(error).toBeInstanceOf(HexDecodeError);
    expect(error).not.toBeInstanceOf(TypeError);
  });

  test("並行する 2 つのデコードストリームは互いに干渉しない", async ({ expect }) => {
    // 準備
    const target = new Hex({ decoder: new FastUtf8({ strict: true }) });
    const streamA = target.getDecodable();
    const streamB = target.getDecodable();
    const writerA = streamA.writable.getWriter();
    const writerB = streamB.writable.getWriter();
    const readingA: Promise<{ chunks: Uint8Array<ArrayBuffer>[]; error: unknown }> = readAll(
      streamA.readable,
    ).then(
      (chunks) => ({ chunks, error: undefined as unknown }),
      (error: unknown) => ({ chunks: [], error }),
    );
    const readingB: Promise<{ chunks: Uint8Array<ArrayBuffer>[]; error: unknown }> = readAll(
      streamB.readable,
    ).then(
      (chunks) => ({ chunks, error: undefined as unknown }),
      (error: unknown) => ({ chunks: [], error }),
    );

    // 実行
    // A のマルチバイト前半と後半の間に B の確定分を挟んで書き込みます。
    let writeErrorA: unknown;
    let writeErrorB: unknown;
    try {
      await writerA.write(new Uint8Array([0xc3]));
    } catch (error) {
      writeErrorA = error;
    }
    try {
      await writerB.write(textEncoder.encode("ab"));
      await writerB.close();
    } catch (error) {
      writeErrorB = error;
    }
    try {
      await writerA.write(new Uint8Array([0xa9]));
      await writerA.close();
    } catch (error) {
      writeErrorA = error;
    }
    const [{ chunks: chunksA, error: readErrorA }, { chunks: chunksB, error: readErrorB }] =
      await Promise.all([readingA, readingB]);

    // 検証
    // A は é を再結合して奇数残りになるため HexDecodeError で失敗します。
    expect(writeErrorA ?? readErrorA).toBeInstanceOf(HexDecodeError);
    expect(writeErrorA ?? readErrorA).not.toBeInstanceOf(TypeError);
    expect(writeErrorB ?? readErrorB).toBeUndefined();
    expect(concatBytes(chunksB)).toStrictEqual(Uint8Array.from([0xab]));
    expect(chunksA).toStrictEqual([]);
  });
});
