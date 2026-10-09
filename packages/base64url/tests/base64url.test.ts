import { FastUtf8 } from "fast-utf8";
import { describe, test } from "vitest";

import Base64Url from "../src/base64url.js";
import { Base64UrlDecodeError } from "../src/errors.js";

const base64url = new Base64Url();
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * バイト列を base64url 化して一括で往復させます。
 */
function roundTrip(data: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  return base64url.decode({ data: base64url.encode({ data }) });
}

/**
 * base64url 文字列を UTF-8 バイト列へ変換します。
 */
function base64UrlBytes(text: string): Uint8Array<ArrayBuffer> {
  return textEncoder.encode(text);
}

describe("初期化と基本属性", () => {
  test("name プロパティは Base64Url を返す", ({ expect }) => {
    // 準備
    const target = new Base64Url();

    // 実行と検証
    expect(target.name).toBe("Base64Url");
  });

  test("isOpen プロパティは常に true を返す", ({ expect }) => {
    // 準備
    const target = new Base64Url();

    // 実行と検証
    expect(target.isOpen).toBe(true);
  });

  test("encode と decode の後も name と isOpen は変化しない", ({ expect }) => {
    // 準備
    const target = new Base64Url();
    const encoded = target.encode({ data: Uint8Array.from([0xfb, 0xff]) });

    // 実行
    target.decode({ data: encoded });

    // 検証
    expect(target.name).toBe("Base64Url");
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
      Uint8Array.from([0x66]),
      Uint8Array.from([0x66, 0x6f]),
      Uint8Array.from([0x66, 0x6f, 0x6f]),
      Uint8Array.from([0x66, 0x6f, 0x6f, 0x62, 0x61, 0x72]),
      Uint8Array.from([0xfb, 0xff]),
      Uint8Array.from([0xfb, 0xef]),
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
    const encoded = base64url.encode({ data: input });
    const output = base64url.decode({ data: encoded });

    // 検証
    expect(output).toStrictEqual(input);
  });

  test("encode 出力は既知ベクトルと一致する", ({ expect }) => {
    // 準備
    const cases: [Uint8Array<ArrayBuffer>, string, string][] = [
      [new Uint8Array(0), "", ""],
      [Uint8Array.from([0x66]), "Zg", "Zg=="],
      [Uint8Array.from([0x66, 0x6f]), "Zm8", "Zm8="],
      [Uint8Array.from([0x66, 0x6f, 0x6f]), "Zm9v", "Zm9v"],
      [Uint8Array.from([0x66, 0x6f, 0x6f, 0x62]), "Zm9vYg", "Zm9vYg=="],
      [Uint8Array.from([0x66, 0x6f, 0x6f, 0x62, 0x61]), "Zm9vYmE", "Zm9vYmE="],
      [Uint8Array.from([0x66, 0x6f, 0x6f, 0x62, 0x61, 0x72]), "Zm9vYmFy", "Zm9vYmFy"],
      [Uint8Array.from([0xfb, 0xff]), "-_8", "-_8="],
      [Uint8Array.from([0xfb, 0xef]), "--8", "--8="],
    ];

    // 実行と検証
    for (const [input, unpadded, padded] of cases) {
      expect(textDecoder.decode(base64url.encode({ data: input })), unpadded).toBe(unpadded);
      expect(
        textDecoder.decode(new Base64Url({ padding: true }).encode({ data: input })),
        padded,
      ).toBe(padded);
    }
  });

  test("encode 出力は base64url の alphabet のみを含む", ({ expect }) => {
    // 準備
    const input = new Uint8Array(256);
    for (let index = 0; index < input.length; index++) {
      input[index] = index;
    }

    // 実行
    const text = textDecoder.decode(base64url.encode({ data: input }));

    // 検証
    expect(text).toMatch(/^[A-Za-z0-9\-_]*$/);
    expect(text).not.toContain("+");
    expect(text).not.toContain("/");
  });

  test("encode 出力の長さは剰余に応じた式に従う", ({ expect }) => {
    // 準備
    const target = new Base64Url();
    const padded = new Base64Url({ padding: true });

    // 実行と検証
    for (let length = 0; length <= 9; length++) {
      const input = new Uint8Array(length);
      const unpaddedLength = Math.floor(length / 3) * 4 + (length % 3 === 0 ? 0 : (length % 3) + 1);
      expect(target.encode({ data: input }).byteLength, `unpadded n=${length}`).toBe(
        unpaddedLength,
      );
      expect(padded.encode({ data: input }).byteLength, `padded n=${length}`).toBe(
        Math.ceil(length / 3) * 4,
      );
    }
  });

  test("出力チャンクの型は Uint8Array であり string ではない", ({ expect }) => {
    // 準備
    const input = Uint8Array.from([0xfb, 0xff]);

    // 実行
    const encoded = base64url.encode({ data: input });

    // 検証
    expect(typeof encoded).not.toBe("string");
    expect(encoded).toBeInstanceOf(Uint8Array);
    expect(encoded.buffer).toBeInstanceOf(ArrayBuffer);
  });
});

describe("デコードの受理系", () => {
  test("付与形と省略形の両方をデコードできる", ({ expect }) => {
    // 準備
    const cases: [string, Uint8Array<ArrayBuffer>][] = [
      ["Zg", Uint8Array.from([0x66])],
      ["Zg==", Uint8Array.from([0x66])],
      ["Zm8", Uint8Array.from([0x66, 0x6f])],
      ["Zm8=", Uint8Array.from([0x66, 0x6f])],
      ["Zm9v", Uint8Array.from([0x66, 0x6f, 0x6f])],
      ["Zm9vYg", Uint8Array.from([0x66, 0x6f, 0x6f, 0x62])],
      ["Zm9vYg==", Uint8Array.from([0x66, 0x6f, 0x6f, 0x62])],
      ["Zm9vYmE", Uint8Array.from([0x66, 0x6f, 0x6f, 0x62, 0x61])],
      ["Zm9vYmE=", Uint8Array.from([0x66, 0x6f, 0x6f, 0x62, 0x61])],
      ["Zm9vYmFy", Uint8Array.from([0x66, 0x6f, 0x6f, 0x62, 0x61, 0x72])],
      ["-_8", Uint8Array.from([0xfb, 0xff])],
      ["-_8=", Uint8Array.from([0xfb, 0xff])],
      ["--8", Uint8Array.from([0xfb, 0xef])],
      ["--8=", Uint8Array.from([0xfb, 0xef])],
    ];

    // 実行と検証
    for (const [text, expected] of cases) {
      expect(base64url.decode({ data: base64UrlBytes(text) }), text).toStrictEqual(expected);
    }
  });

  test("大文字と小文字は別の値として区別される", ({ expect }) => {
    // 準備
    const upper = base64url.decode({ data: base64UrlBytes("AB") });
    const lower = base64url.decode({ data: base64UrlBytes("ab") });

    // 実行と検証
    expect(upper).not.toStrictEqual(lower);
  });

  test("空のバイト列は空にデコードされる", ({ expect }) => {
    // 準備
    const input = new Uint8Array(0);

    // 実行
    const output = base64url.decode({ data: input });

    // 検証
    expect(output).toStrictEqual(new Uint8Array(0));
  });

  test("未使用下位ビットが非正準でも受理される", ({ expect }) => {
    // 実行と検証
    expect(base64url.decode({ data: base64UrlBytes("Zh==") })).toStrictEqual(
      base64url.decode({ data: base64UrlBytes("Zg==") }),
    );
    expect(base64url.decode({ data: base64UrlBytes("Zh==") })).toStrictEqual(
      Uint8Array.from([0x66]),
    );
    expect(base64url.decode({ data: base64UrlBytes("Zm9=") })).toStrictEqual(
      base64url.decode({ data: base64UrlBytes("Zm8=") }),
    );
    expect(base64url.decode({ data: base64UrlBytes("Zm9=") })).toStrictEqual(
      Uint8Array.from([0x66, 0x6f]),
    );
  });

  test("BOM 単体は既定で空にデコードされる", ({ expect }) => {
    // 準備
    const input = Uint8Array.from([0xef, 0xbb, 0xbf]);

    // 実行
    const output = base64url.decode({ data: input });

    // 検証
    expect(output).toStrictEqual(new Uint8Array(0));
  });

  test("ignoreBOM 注入時の BOM 単体は Base64UrlDecodeError で拒否される", ({ expect }) => {
    // 準備
    const target = new Base64Url({ decoder: new FastUtf8({ strict: true, ignoreBOM: true }) });

    // 実行と検証
    expect(() => target.decode({ data: Uint8Array.from([0xef, 0xbb, 0xbf]) })).toThrow(
      Base64UrlDecodeError,
    );
  });
});

describe("デコードの異常系", () => {
  test("length が 4 で割って 1 余る入力は Base64UrlDecodeError で拒否される", ({ expect }) => {
    // 準備
    const target = new Base64Url();

    // 実行と検証
    for (const text of ["a", "abcde", "Zm9vYmFyZ"]) {
      expect(() => target.decode({ data: base64UrlBytes(text) }), text).toThrow(
        Base64UrlDecodeError,
      );
    }
  });

  test("誤配置の = は Base64UrlDecodeError で拒否される", ({ expect }) => {
    // 準備
    const target = new Base64Url();

    // 実行と検証
    for (const text of ["=", "==", "===", "=abc", "ab=c", "Zg==a", "Zg===", "Zm8=="]) {
      expect(() => target.decode({ data: base64UrlBytes(text) }), JSON.stringify(text)).toThrow(
        Base64UrlDecodeError,
      );
    }
  });

  test("標準 alphabet の + と / は Base64UrlDecodeError で拒否される", ({ expect }) => {
    // 準備
    const target = new Base64Url();

    // 実行と検証
    for (const text of ["ab+c", "ab/c", "++", "//", "+/8="]) {
      expect(() => target.decode({ data: base64UrlBytes(text) }), JSON.stringify(text)).toThrow(
        Base64UrlDecodeError,
      );
    }
  });

  test("不正文字を含む入力は Base64UrlDecodeError で拒否される", ({ expect }) => {
    // 準備
    const target = new Base64Url();

    // 実行と検証
    for (const text of [" ", "\n", "ab cd", "ａｂｃｄ"]) {
      expect(() => target.decode({ data: base64UrlBytes(text) }), JSON.stringify(text)).toThrow(
        Base64UrlDecodeError,
      );
    }
  });

  test("有効な UTF-8 の非 alphabet 文字は Base64UrlDecodeError で拒否される", ({ expect }) => {
    // 準備
    const target = new Base64Url();
    const input = textEncoder.encode("é");

    // 実行
    let thrown: unknown;
    try {
      target.decode({ data: input });
    } catch (error) {
      thrown = error;
    }

    // 検証
    expect(thrown).toBeInstanceOf(Base64UrlDecodeError);
    expect(thrown).not.toBeInstanceOf(TypeError);
  });

  test("不正な UTF-8 は TypeError で拒否される", ({ expect }) => {
    // 準備
    const target = new Base64Url();

    // 実行と検証
    expect(() => target.decode({ data: Uint8Array.from([0xff]) })).toThrow(TypeError);
    expect(() => target.decode({ data: Uint8Array.from([0xff]) })).not.toThrow(
      Base64UrlDecodeError,
    );
  });

  test("投げたエラーは Error の派生であり name は UniKvsBase64UrlDecodeError である", ({
    expect,
  }) => {
    // 準備
    const target = new Base64Url();

    // 実行
    let thrown: unknown;
    try {
      target.decode({ data: base64UrlBytes("ab+c") });
    } catch (error) {
      thrown = error;
    }

    // 検証
    expect(thrown).toBeInstanceOf(globalThis.Error);
    expect(thrown).toBeInstanceOf(Base64UrlDecodeError);
    expect((thrown as Base64UrlDecodeError).name).toBe("UniKvsBase64UrlDecodeError");
  });
});
