import { describe, test } from "vitest";

import { HexDecodeError } from "../src/errors.js";
import Hex from "../src/hex.js";

const hex = new Hex();
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * バイト列を hex 化して一括で往復させます。
 */
function roundTrip(data: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  return hex.decode({ data: hex.encode({ data }) });
}

/**
 * hex 文字列を UTF-8 バイト列へ変換します。
 */
function hexBytes(text: string): Uint8Array<ArrayBuffer> {
  return textEncoder.encode(text);
}

describe("初期化と基本属性", () => {
  test("name プロパティは Hex を返す", ({ expect }) => {
    // 準備
    const target = new Hex();

    // 実行と検証
    expect(target.name).toBe("Hex");
  });

  test("isOpen プロパティは常に true を返す", ({ expect }) => {
    // 準備
    const target = new Hex();

    // 実行と検証
    expect(target.isOpen).toBe(true);
  });

  test("encode と decode の後も name と isOpen は変化しない", ({ expect }) => {
    // 準備
    const target = new Hex();
    const encoded = target.encode({ data: Uint8Array.from([0xde, 0xad]) });

    // 実行
    target.decode({ data: encoded });

    // 検証
    expect(target.name).toBe("Hex");
    expect(target.isOpen).toBe(true);
  });
});

describe("一括のラウンドトリップ", () => {
  test("空のバイト列を往復すると空のバイト列に戻る", ({ expect }) => {
    // 準備
    const input = new Uint8Array(0);

    // 実行
    const output = roundTrip(input);

    // 検証
    expect(output).toStrictEqual(new Uint8Array(0));
  });

  test("単一バイトを往復すると元の値に戻る", ({ expect }) => {
    // 実行と検証
    for (const byte of [0x00, 0x01, 0x7f, 0x80, 0xfe, 0xff]) {
      expect(roundTrip(Uint8Array.from([byte])), `byte=${byte}`).toStrictEqual(
        Uint8Array.from([byte]),
      );
    }
  });

  test("代表ベクトルを往復すると元の値に戻る", ({ expect }) => {
    // 準備
    const vectors: Uint8Array<ArrayBuffer>[] = [
      Uint8Array.from([0xde, 0xad, 0xbe, 0xef]),
      Uint8Array.from([0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef]),
      Uint8Array.from([0x00, 0x01, 0x02, 0xfd, 0xfe, 0xff]),
    ];

    // 実行と検証
    for (const input of vectors) {
      expect(roundTrip(input)).toStrictEqual(input);
    }
  });

  test("1 MiB のバイト列を往復すると同じバイト列に戻る", ({ expect }) => {
    // 準備
    const input = new Uint8Array(1024 * 1024);
    for (let index = 0; index < input.length; index++) {
      input[index] = index % 251;
    }

    // 実行
    const encoded = hex.encode({ data: input });
    const output = hex.decode({ data: encoded });

    // 検証
    expect(output).toStrictEqual(input);
  });

  test("encode 出力は小文字の hex である", ({ expect }) => {
    // 準備
    const cases: [Uint8Array<ArrayBuffer>, string][] = [
      [new Uint8Array(0), ""],
      [Uint8Array.from([0x00]), "00"],
      [Uint8Array.from([0xff]), "ff"],
      [Uint8Array.from([0xde, 0xad, 0xbe, 0xef]), "deadbeef"],
      [Uint8Array.from([0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef]), "0123456789abcdef"],
      [Uint8Array.from([0x00, 0x01, 0x02, 0xfd, 0xfe, 0xff]), "000102fdfeff"],
    ];

    // 実行と検証
    for (const [input, expected] of cases) {
      expect(textDecoder.decode(hex.encode({ data: input })), expected).toBe(expected);
    }
  });

  test("encode 出力の長さは入力の 2 倍である", ({ expect }) => {
    // 準備
    const input = Uint8Array.from([0xde, 0xad, 0xbe, 0xef]);

    // 実行
    const encoded = hex.encode({ data: input });

    // 検証
    expect(encoded.byteLength).toBe(input.byteLength * 2);
  });

  test("出力チャンクの型は Uint8Array であり string ではない", ({ expect }) => {
    // 準備
    const input = Uint8Array.from([0xde, 0xad, 0xbe, 0xef]);

    // 実行
    const encoded = hex.encode({ data: input });

    // 検証
    expect(typeof encoded).not.toBe("string");
    expect(encoded).toBeInstanceOf(Uint8Array);
    expect(encoded.buffer).toBeInstanceOf(ArrayBuffer);
  });
});

describe("デコードの受理系", () => {
  test("小文字の hex をデコードできる", ({ expect }) => {
    // 準備
    const input = hexBytes("deadbeef");

    // 実行
    const output = hex.decode({ data: input });

    // 検証
    expect(output).toStrictEqual(Uint8Array.from([0xde, 0xad, 0xbe, 0xef]));
  });

  test("大文字の hex をデコードできる", ({ expect }) => {
    // 準備
    const input = hexBytes("DEADBEEF");

    // 実行
    const output = hex.decode({ data: input });

    // 検証
    expect(output).toStrictEqual(Uint8Array.from([0xde, 0xad, 0xbe, 0xef]));
  });

  test("大文字小文字が混在した hex をデコードできる", ({ expect }) => {
    // 準備
    const input = hexBytes("DeAdBeEf");

    // 実行
    const output = hex.decode({ data: input });

    // 検証
    expect(output).toStrictEqual(Uint8Array.from([0xde, 0xad, 0xbe, 0xef]));
  });

  test("空のバイト列は空にデコードされる", ({ expect }) => {
    // 準備
    const input = new Uint8Array(0);

    // 実行
    const output = hex.decode({ data: input });

    // 検証
    expect(output).toStrictEqual(new Uint8Array(0));
  });
});

describe("デコードの異常系", () => {
  test("奇数長の hex は HexDecodeError で拒否される", ({ expect }) => {
    // 準備
    const target = new Hex();

    // 実行と検証
    for (const text of ["0", "abc", "0123456789a"]) {
      expect(() => target.decode({ data: hexBytes(text) }), text).toThrow(HexDecodeError);
    }
  });

  test("不正文字を含む hex は HexDecodeError で拒否される", ({ expect }) => {
    // 準備
    const target = new Hex();

    // 実行と検証
    for (const text of ["zz", "0x", "0xdeadbeef", " ", "\n", "de-ad", "ｄｅａｄ"]) {
      expect(() => target.decode({ data: hexBytes(text) }), JSON.stringify(text)).toThrow(
        HexDecodeError,
      );
    }
  });

  test("有効な UTF-8 の非 hex 文字は HexDecodeError で拒否される", ({ expect }) => {
    // 準備
    const target = new Hex();
    const input = textEncoder.encode("é");

    // 実行
    let thrown: unknown;
    try {
      target.decode({ data: input });
    } catch (error) {
      thrown = error;
    }

    // 検証
    expect(thrown).toBeInstanceOf(HexDecodeError);
    expect(thrown).not.toBeInstanceOf(TypeError);
  });

  test("不正な UTF-8 は TypeError で拒否される", ({ expect }) => {
    // 準備
    const target = new Hex();

    // 実行と検証
    expect(() => target.decode({ data: Uint8Array.from([0xff]) })).toThrow(TypeError);
    expect(() => target.decode({ data: Uint8Array.from([0xff]) })).not.toThrow(HexDecodeError);
  });

  test("投げたエラーは Error の派生であり name は UniKvsHexDecodeError である", ({ expect }) => {
    // 準備
    const target = new Hex();

    // 実行
    let thrown: unknown;
    try {
      target.decode({ data: hexBytes("zz") });
    } catch (error) {
      thrown = error;
    }

    // 検証
    expect(thrown).toBeInstanceOf(globalThis.Error);
    expect(thrown).toBeInstanceOf(HexDecodeError);
    expect((thrown as HexDecodeError).name).toBe("UniKvsHexDecodeError");
  });
});
