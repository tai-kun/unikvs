import { describe, expect, test } from "vitest";

import Cbor from "../src/cbor.js";
import { CborDecodeError, CborEncodeError } from "../src/errors.js";
import { concatBytes } from "./helpers.js";

const cbor = new Cbor();

/**
 * 値を CBOR のバイト列へ変換します。
 */
function encode(data: unknown): Uint8Array<ArrayBuffer> {
  return cbor.encode({ data });
}

/**
 * CBOR のバイト列を値へ変換します。
 */
function decode(data: Uint8Array<ArrayBuffer>): unknown {
  return cbor.decode({ data });
}

describe("初期化と基本属性", () => {
  test("name プロパティは Cbor を返す", ({ expect }) => {
    // 実行と検証
    expect(cbor.name).toBe("Cbor");
  });

  test("isOpen プロパティは常に true を返す", ({ expect }) => {
    // 実行と検証
    expect(cbor.isOpen).toBe(true);
  });

  test("encode と decode の後も name と isOpen は変化しない", ({ expect }) => {
    // 準備
    const encoded = encode({ value: 1 });

    // 実行
    decode(encoded);

    // 検証
    expect(cbor.name).toBe("Cbor");
    expect(cbor.isOpen).toBe(true);
  });
});

describe("プリミティブ値のラウンドトリップ", () => {
  test.each([
    ["null", null],
    ["true", true],
    ["false", false],
    ["0", 0],
    ["正の整数", 1],
    ["負の整数", -1],
    ["安全な整数の上限", Number.MAX_SAFE_INTEGER],
    ["安全な整数の下限", Number.MIN_SAFE_INTEGER],
    ["小数", 1.5],
    ["負の小数", -2.25],
    ["小さな小数", 1e-10],
    ["空文字列", ""],
    ["ASCII 文字列", "hello"],
    ["Unicode 文字列", "こんにちは🌏"],
    ["サロゲートペアを含む文字列", "👍🏽 ok"],
    ["ヌル文字を含む文字列", "a\0b"],
  ])("%s を往復すると同じ値に戻る", (_label, input) => {
    // 実行
    const output = decode(encode(input));

    // 検証
    expect(output).toStrictEqual(input);
  });

  test("NaN を往復すると NaN に戻る", ({ expect }) => {
    // 実行
    const output = decode(encode(NaN));

    // 検証
    expect(Number.isNaN(output)).toBe(true);
  });

  test.each([["Infinity"], ["-Infinity"]])("%s を往復すると同じ値に戻る", (label) => {
    // 準備
    const input = label === "Infinity" ? Infinity : -Infinity;

    // 実行
    const output = decode(encode(input));

    // 検証
    expect(output).toBe(input);
  });

  test("-0 は CBOR の整数表現に負のゼロがないため 0 として往復する", ({ expect }) => {
    // 実行
    const output = decode(encode(-0));

    // 検証
    expect(output).toBe(0);
    expect(Object.is(output, -0)).toBe(false);
  });

  test("undefined を往復すると undefined に戻る", ({ expect }) => {
    // 実行
    const output = decode(encode(undefined));

    // 検証
    expect(output).toBeUndefined();
  });

  test("オブジェクトと配列に含まれる undefined も保持される", ({ expect }) => {
    // 準備
    const input = { a: undefined, b: 1, c: [undefined, "x"] };

    // 実行
    const output = decode(encode(input)) as typeof input;

    // 検証
    expect(output).toStrictEqual(input);
    expect(Object.hasOwn(output, "a")).toBe(true);
    expect(output.a).toBeUndefined();
  });

  test.each([
    ["0n", 0n],
    ["正の小さな bigint", 10n],
    ["負の小さな bigint", -10n],
    ["2^60", 1152921504606846976n],
    ["2^64-1", 18446744073709551615n],
    ["2^64", 18446744073709551616n],
    ["2^64 を超える値", 340282366920938463463374607431768211457n],
    ["-2^64", -18446744073709551616n],
    ["-2^64 を下回る値", -340282366920938463463374607431768211457n],
  ])("%s を往復すると bigint のまま戻る", (_label, input) => {
    // 実行
    const output = decode(encode(input));

    // 検証
    expect(typeof output).toBe("bigint");
    expect(output).toStrictEqual(input);
  });
});

describe("複合値のラウンドトリップ", () => {
  test("配列を往復すると同じ値に戻る", ({ expect }) => {
    // 準備
    const input = [1, "two", [true, null], { three: 3 }];

    // 実行
    const output = decode(encode(input));

    // 検証
    expect(output).toStrictEqual(input);
  });

  test("オブジェクトを往復すると同じ値に戻る", ({ expect }) => {
    // 準備
    const input = {
      name: "unikvs",
      nested: { enabled: true, count: 2 },
      list: [1, 2, 3],
    };

    // 実行
    const output = decode(encode(input));

    // 検証
    expect(output).toStrictEqual(input);
  });

  test.each([
    ["空の配列", []],
    ["空のオブジェクト", {}],
    ["空の Map", new Map()],
    ["空の Set", new Set()],
    ["空の Uint8Array", new Uint8Array(0)],
  ])("%s を往復すると同じ値に戻る", (_label, input) => {
    // 実行
    const output = decode(encode(input));

    // 検証
    expect(output).toStrictEqual(input);
  });

  test("Date を往復すると同じ時刻に戻る", ({ expect }) => {
    // 準備
    const input = new Date("2024-01-02T03:04:05.678Z");

    // 実行
    const output = decode(encode(input));

    // 検証
    expect(output).toBeInstanceOf(Date);
    expect(output).toStrictEqual(input);
  });

  test("ミリ秒を持たない Date も往復できる", ({ expect }) => {
    // 準備
    const input = new Date("2024-01-02T03:04:05.000Z");

    // 実行
    const output = decode(encode(input));

    // 検証
    expect(output).toStrictEqual(input);
  });

  test("文字列キーの Map は Map として往復する", ({ expect }) => {
    // 準備
    const input = new Map<string, unknown>([
      ["a", 1],
      ["b", { c: 2 }],
    ]);

    // 実行
    const output = decode(encode(input));

    // 検証
    expect(output).toBeInstanceOf(Map);
    expect(output).toStrictEqual(input);
  });

  test("文字列以外をキーに持つ Map も Map として往復する", ({ expect }) => {
    // 準備
    const input = new Map<unknown, unknown>([
      [1, "one"],
      [true, false],
      [{ key: "object" }, [1, 2]],
    ]);

    // 実行
    const output = decode(encode(input));

    // 検証
    expect(output).toBeInstanceOf(Map);
    expect(output).toStrictEqual(input);
  });

  test("Set を往復すると同じ要素に戻る", ({ expect }) => {
    // 準備
    const input = new Set<unknown>([1, "two", { three: 3 }, [4]]);

    // 実行
    const output = decode(encode(input));

    // 検証
    expect(output).toBeInstanceOf(Set);
    expect(output).toStrictEqual(input);
  });

  test("RegExp を往復すると同じパターンに戻る", ({ expect }) => {
    // 準備
    const input = /ab+c/gi;

    // 実行
    const output = decode(encode(input));

    // 検証
    expect(output).toBeInstanceOf(RegExp);
    expect(output).toStrictEqual(input);
  });

  test("Error を往復すると名前とメッセージが戻る", ({ expect }) => {
    // 準備
    const input = new Error("something went wrong");

    // 実行
    const output = decode(encode(input));

    // 検証
    expect(output).toBeInstanceOf(Error);
    expect((output as Error).name).toBe("Error");
    expect((output as Error).message).toBe("something went wrong");
  });

  test.each([
    ["Uint8Array", Uint8Array.of(0, 1, 2, 253, 254, 255)],
    ["Int16Array", Int16Array.of(-2, -1, 0, 1, 2)],
    ["Float64Array", Float64Array.of(1.5, -2.25, Number.POSITIVE_INFINITY)],
  ])("%s を往復すると同じバイト列に戻る", (_label, input) => {
    // 実行
    const output = decode(encode(input));

    // 検証
    expect(output).toBeInstanceOf(input.constructor);
    expect(output).toStrictEqual(input);
  });

  test("1 MiB のバイト列を往復すると同じバイト列に戻る", ({ expect }) => {
    // 準備
    const input = new Uint8Array(1024 * 1024);
    for (let index = 0; index < input.length; index++) {
      input[index] = index % 251;
    }

    // 実行
    const encoded = encode(input);
    const output = decode(encoded);

    // 検証
    expect(encoded).toBeInstanceOf(Uint8Array);
    expect(encoded.buffer).toBeInstanceOf(ArrayBuffer);
    expect(output).toStrictEqual(input);
  });

  test("シンボルをキーに持つプロパティーは取り除かれる", ({ expect }) => {
    // 準備
    const input = { [Symbol("hidden")]: 1, visible: 2 };

    // 実行
    const output = decode(encode(input)) as Record<string, unknown>;

    // 検証
    expect(output).toStrictEqual({ visible: 2 });
    expect(Object.getOwnPropertySymbols(output)).toStrictEqual([]);
  });
});

describe("標準の CBOR との相互運用", () => {
  test("標準のマップはプレーンオブジェクトへデコードされる", ({ expect }) => {
    // 準備
    const input = Uint8Array.from([0xa1, 0x61, 0x61, 0x01]);

    // 実行
    const output = decode(input);

    // 検証
    expect(output).toStrictEqual({ a: 1 });
  });

  test("文字列以外をキーに持つ標準のマップはキーが文字列化される", ({ expect }) => {
    // 準備
    const input = Uint8Array.from([0xa1, 0x01, 0x02]);

    // 実行
    const output = decode(input);

    // 検証
    expect(output).toStrictEqual({ "1": 2 });
  });

  test("タグ 259 のマップは Map へデコードされる", ({ expect }) => {
    // 準備
    const input = Uint8Array.from([0xd9, 0x01, 0x03, 0xa1, 0x61, 0x61, 0x01]);

    // 実行
    const output = decode(input);

    // 検証
    expect(output).toBeInstanceOf(Map);
    expect(output).toStrictEqual(new Map([["a", 1]]));
  });

  test("タグ 259 のマップは文字列以外のキーも保持する", ({ expect }) => {
    // 準備
    const input = Uint8Array.from([0xd9, 0x01, 0x03, 0xa1, 0x01, 0x61, 0x78]);

    // 実行
    const output = decode(input);

    // 検証
    expect(output).toStrictEqual(new Map([[1, "x"]]));
  });

  test("タグ 258 のセットは Set へデコードされる", ({ expect }) => {
    // 準備
    const input = Uint8Array.from([0xd9, 0x01, 0x02, 0x82, 0x01, 0x02]);

    // 実行
    const output = decode(input);

    // 検証
    expect(output).toStrictEqual(new Set([1, 2]));
  });

  test.each([
    ["長さ不定の配列", Uint8Array.from([0x9f, 0x01, 0x02, 0xff]), [1, 2]],
    ["長さ不定のマップ", Uint8Array.from([0xbf, 0x61, 0x61, 0x01, 0xff]), { a: 1 }],
  ])("%s をデコードできる", (_label, input, expected) => {
    // 実行
    const output = decode(input);

    // 検証
    expect(output).toStrictEqual(expected);
  });
});

describe("デコードの異常系", () => {
  test("空のバイト列は CborDecodeError を投げる", ({ expect }) => {
    // 準備
    const input = new Uint8Array(0);

    // 実行
    let thrown: unknown;
    try {
      decode(input);
    } catch (error) {
      thrown = error;
    }

    // 検証
    expect(thrown).toBeInstanceOf(CborDecodeError);
    expect(((thrown as CborDecodeError).cause as Error).message).toContain(
      "Unexpected end of CBOR data",
    );
  });

  test("1 つの値の後に続くバイト列は CborDecodeError を投げる", ({ expect }) => {
    // 準備
    const input = concatBytes([encode(1), encode(2)]);

    // 実行
    let thrown: unknown;
    try {
      decode(input);
    } catch (error) {
      thrown = error;
    }

    // 検証
    expect(thrown).toBeInstanceOf(CborDecodeError);
    expect(((thrown as CborDecodeError).cause as Error).message).toContain(
      "Data read, but end of buffer not reached",
    );
  });

  test.each([
    ["不明なトークン", Uint8Array.of(0x1c), "Unknown token"],
    ["不正な長さ不定の整数", Uint8Array.of(0x1f), "Invalid major type for indefinite length"],
  ])("%s を含むバイト列は CborDecodeError を投げる", (_label, input, message) => {
    // 実行
    let thrown: unknown;
    try {
      decode(input);
    } catch (error) {
      thrown = error;
    }

    // 検証
    expect(thrown).toBeInstanceOf(CborDecodeError);
    expect(((thrown as CborDecodeError).cause as Error).message).toContain(message);
  });

  test.each([
    ["長さ不定のバイト文字列", Uint8Array.of(0x5f, 0x41, 0x00, 0xff)],
    ["長さ不定のテキスト文字列", Uint8Array.of(0x7f, 0x61, 0x61, 0xff)],
  ])("%s は CborDecodeError を投げる", (_label, input) => {
    // 実行
    let thrown: unknown;
    try {
      decode(input);
    } catch (error) {
      thrown = error;
    }

    // 検証
    expect(thrown).toBeInstanceOf(CborDecodeError);
    expect(((thrown as CborDecodeError).cause as Error).message).toContain(
      "Indefinite length not supported for byte or text strings",
    );
  });
});

describe("エンコードの異常系", () => {
  test.each([
    ["ルートの関数", () => {}],
    ["ルートのシンボル", Symbol("value")],
    ["オブジェクトに含まれる関数", { value: () => {} }],
    ["オブジェクトに含まれるシンボル", { value: Symbol("value") }],
    ["配列に含まれる関数", [() => {}]],
    ["配列に含まれるシンボル", [Symbol("value")]],
  ])("%s は CborEncodeError を投げる", (_label, input) => {
    // 実行
    let thrown: unknown;
    try {
      encode(input);
    } catch (error) {
      thrown = error;
    }

    // 検証
    expect(thrown).toBeInstanceOf(CborEncodeError);
    expect((thrown as CborEncodeError).cause).toBeInstanceOf(Error);
    expect(((thrown as CborEncodeError).cause as Error).message).toContain("Unknown type");
  });
});
