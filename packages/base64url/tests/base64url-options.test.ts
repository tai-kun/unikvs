import { FastUtf8 } from "fast-utf8";
import { describe, test } from "vitest";

import Base64Url, { type Base64UrlOptions } from "../src/base64url.js";
import { Base64UrlDecodeError } from "../src/errors.js";
import { concatBytes, pumpThrough, readAll } from "./helpers.js";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

describe("コンストラクター注入", () => {
  test("空のオプションでは既定と等価に往復できる", ({ expect }) => {
    // 準備
    const options: Base64UrlOptions = {};
    const target = new Base64Url(options);
    const input = Uint8Array.from([0xfb, 0xff]);

    // 実行
    const output = target.decode({ data: target.encode({ data: input }) });

    // 検証
    expect(output).toStrictEqual(input);
    expect(target.name).toBe("Base64Url");
  });

  test("padding の既定は省略であり明示 false と等価である", ({ expect }) => {
    // 準備
    const input = Uint8Array.from([0x66]);

    // 実行
    const omitted = new Base64Url().encode({ data: input });
    const explicit = new Base64Url({ padding: false }).encode({ data: input });

    // 検証
    expect(textDecoder.decode(omitted)).toBe("Zg");
    expect(omitted).toStrictEqual(explicit);
  });

  test("padding が true なら = を付与する", ({ expect }) => {
    // 準備
    const target = new Base64Url({ padding: true });

    // 実行と検証
    expect(textDecoder.decode(target.encode({ data: Uint8Array.from([0x66]) }))).toBe("Zg==");
    expect(textDecoder.decode(target.encode({ data: Uint8Array.from([0x66, 0x6f]) }))).toBe("Zm8=");
    expect(textDecoder.decode(target.encode({ data: Uint8Array.from([0x66, 0x6f, 0x6f]) }))).toBe(
      "Zm9v",
    );
  });

  test("padding 設定にかかわらず decode は両方を受理する", ({ expect }) => {
    // 準備
    const omitted = new Base64Url({ padding: false });
    const added = new Base64Url({ padding: true });

    // 実行と検証
    expect(omitted.decode({ data: textEncoder.encode("Zg") })).toStrictEqual(
      Uint8Array.from([0x66]),
    );
    expect(omitted.decode({ data: textEncoder.encode("Zg==") })).toStrictEqual(
      Uint8Array.from([0x66]),
    );
    expect(added.decode({ data: textEncoder.encode("Zg") })).toStrictEqual(Uint8Array.from([0x66]));
    expect(added.decode({ data: textEncoder.encode("Zg==") })).toStrictEqual(
      Uint8Array.from([0x66]),
    );
  });

  test("注入した encoder で一括 encode できる", ({ expect }) => {
    // 準備
    const target = new Base64Url({
      encoder: new FastUtf8({ strict: false, allocateSize: 64, caching: false }),
    });
    const input = Uint8Array.from([0xfb, 0xff]);

    // 実行
    const encoded = target.encode({ data: input });

    // 検証
    expect(encoded).toStrictEqual(new Base64Url().encode({ data: input }));
    expect(target.decode({ data: encoded })).toStrictEqual(input);
  });

  test("注入した encoder はストリームの encode にも使われる", async ({ expect }) => {
    // 準備
    const target = new Base64Url({
      encoder: new FastUtf8({ strict: false, allocateSize: 64, caching: false }),
    });
    const input = Uint8Array.from([0xfb, 0xff]);

    // 実行
    const result = await pumpThrough(target.getEncodable(), [input]);

    // 検証
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(concatBytes(result.outputChunks)).toStrictEqual(new Base64Url().encode({ data: input }));
  });

  test("padding 注入時はストリームの encode にも反映される", async ({ expect }) => {
    // 準備
    const target = new Base64Url({ padding: true });
    const input = Uint8Array.from([0x66]);

    // 実行
    const result = await pumpThrough(target.getEncodable(), [input]);

    // 検証
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(textDecoder.decode(concatBytes(result.outputChunks))).toBe("Zg==");
  });

  test("注入した decoder で一括 decode できる", ({ expect }) => {
    // 準備
    const target = new Base64Url({ decoder: new FastUtf8({ strict: true, caching: false }) });

    // 実行と検証
    expect(target.decode({ data: textEncoder.encode("Zm9v") })).toStrictEqual(
      Uint8Array.from([0x66, 0x6f, 0x6f]),
    );
    expect(() => target.decode({ data: Uint8Array.from([0xff]) })).toThrow(TypeError);
    expect(() => target.decode({ data: Uint8Array.from([0xff]) })).not.toThrow(
      Base64UrlDecodeError,
    );
  });

  test("非 strict の decoder 注入時は一括の不正 UTF-8 が Base64UrlDecodeError になる", ({
    expect,
  }) => {
    // 準備
    const target = new Base64Url({ decoder: new FastUtf8({ strict: false }) });

    // 実行
    let thrown: unknown;
    try {
      target.decode({ data: Uint8Array.from([0xff]) });
    } catch (error) {
      thrown = error;
    }

    // 検証
    expect(thrown).toBeInstanceOf(Base64UrlDecodeError);
    expect(thrown).not.toBeInstanceOf(TypeError);
  });

  test("ストリームは注入した decoder の strict 設定を引き継ぐ", async ({ expect }) => {
    // 準備
    const target = new Base64Url({ decoder: new FastUtf8({ strict: false }) });
    const invalid = Uint8Array.from([0x31, 0x0a, 0xff, 0x0a]);

    // 実行
    const result = await pumpThrough(target.getDecodable(), [invalid]);
    const error = result.writeError ?? result.readError;

    // 検証
    expect(error).toBeInstanceOf(Base64UrlDecodeError);
    expect(error).not.toBeInstanceOf(TypeError);
  });

  test("ストリームは ignoreBOM を引き継がず BOM 単体は空成功する", async ({ expect }) => {
    // 準備
    const target = new Base64Url({
      decoder: new FastUtf8({ strict: true, ignoreBOM: true }),
    });
    const bom = Uint8Array.from([0xef, 0xbb, 0xbf]);

    // 実行
    const single = await pumpThrough(target.getDecodable(), [bom]);

    // 検証
    expect(single.writeError).toBeUndefined();
    expect(single.readError).toBeUndefined();
    expect(single.outputChunks).toStrictEqual([]);
  });

  test("並行する 2 つのデコードストリームは互いに干渉しない", async ({ expect }) => {
    // 準備
    const target = new Base64Url({ decoder: new FastUtf8({ strict: true }) });
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
    // A は é を再結合して alphabet 外になるため Base64UrlDecodeError で失敗します。
    expect(writeErrorA ?? readErrorA).toBeInstanceOf(Base64UrlDecodeError);
    expect(writeErrorA ?? readErrorA).not.toBeInstanceOf(TypeError);
    expect(writeErrorB ?? readErrorB).toBeUndefined();
    expect(concatBytes(chunksB)).toStrictEqual(Uint8Array.from([0x69]));
    expect(chunksA).toStrictEqual([]);
  });
});
