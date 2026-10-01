import { describe, test } from "vitest";

import { JsonUnsupportedValueError } from "../src/index.js";
import Json from "../src/json.js";
import { concatBytes, pumpThrough, readAll, sourceFrom, splitIntoChunks } from "./helpers.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * 文字列を UTF-8 のバイト列へ変換します。
 */
function jsonLines(text: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(text);
}

describe("getEncodable", () => {
  test("各値を 1 行の JSON として出力し、末尾に改行を付ける", async ({ expect }) => {
    // 準備
    const json = new Json();
    const values: unknown[] = [1, "a", true, null, { b: 2 }, [3]];

    // 実行
    const result = await pumpThrough(json.getEncodable(), values);

    // 検証
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(result.outputChunks).toHaveLength(values.length);
    for (const [index, chunk] of result.outputChunks.entries()) {
      expect(decoder.decode(chunk), `index=${index}`).toBe(`${JSON.stringify(values[index])}\n`);
    }
    expect(decoder.decode(concatBytes(result.outputChunks))).toBe(
      '1\n"a"\ntrue\nnull\n{"b":2}\n[3]\n',
    );
  });

  test("値に含まれる改行はエスケープされ行を壊さない", async ({ expect }) => {
    // 準備
    const json = new Json();
    const values = ["a\nb", "c\rd", "\u2028\u2029", "😀"];

    // 実行
    const encoded = await pumpThrough(json.getEncodable(), values);
    const decoded = await pumpThrough(json.getDecodable(), encoded.outputChunks);

    // 検証
    expect(encoded.writeError).toBeUndefined();
    expect(encoded.readError).toBeUndefined();
    expect(decoded.writeError).toBeUndefined();
    expect(decoded.readError).toBeUndefined();
    expect(decoded.outputChunks).toStrictEqual(values);
  });

  test("空のストリームは空の出力になる", async ({ expect }) => {
    // 準備
    const json = new Json();

    // 実行
    const result = await pumpThrough(json.getEncodable(), []);

    // 検証
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(result.outputChunks).toStrictEqual([]);
  });

  test("JSON に変換できない値は JsonUnsupportedValueError で拒否される", async ({ expect }) => {
    // 準備
    const json = new Json();

    // 実行
    const result = await pumpThrough(json.getEncodable(), [1, Symbol("x"), 2]);

    // 検証
    expect(result.writeError ?? result.readError).toBeInstanceOf(JsonUnsupportedValueError);
  });
});

describe("getDecodable", () => {
  test("複数の値をデコードする", async ({ expect }) => {
    // 準備
    const json = new Json();

    // 実行
    const result = await pumpThrough(json.getDecodable(), [
      jsonLines('1\n"a"\ntrue\nnull\n{"b":2}\n[3]\n'),
    ]);

    // 検証
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(result.outputChunks).toStrictEqual([1, "a", true, null, { b: 2 }, [3]]);
  });

  test("1 バイトずつ分割してもデコードできる", async ({ expect }) => {
    // 準備
    const json = new Json();
    const bytes = jsonLines('{"message":"日本語😀","values":[1,2,3]}\n');

    // 実行
    const result = await pumpThrough(json.getDecodable(), splitIntoChunks(bytes, 1));

    // 検証
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(result.outputChunks).toStrictEqual([{ message: "日本語😀", values: [1, 2, 3] }]);
  });

  test("不揃いな境界で分割してもデコードできる", async ({ expect }) => {
    // 準備
    const json = new Json();
    const values = [{ a: "x".repeat(100) }, [1, 2, 3], "末尾", 0];
    const bytes = jsonLines(values.map((value) => `${JSON.stringify(value)}\n`).join(""));

    // 実行と検証
    for (const size of [1, 2, 3, 5, 7, 13, 64]) {
      const result = await pumpThrough(json.getDecodable(), splitIntoChunks(bytes, size));
      expect(result.writeError, `size=${size}`).toBeUndefined();
      expect(result.readError, `size=${size}`).toBeUndefined();
      expect(result.outputChunks, `size=${size}`).toStrictEqual(values);
    }
  });

  test("最終行は末尾の改行がなくてもデコードされる", async ({ expect }) => {
    // 準備
    const json = new Json();

    // 実行と検証
    for (const text of ["1\n2\n3", "1\n2\n3\n"]) {
      const result = await pumpThrough(json.getDecodable(), [jsonLines(text)]);
      expect(result.writeError, text).toBeUndefined();
      expect(result.readError, text).toBeUndefined();
      expect(result.outputChunks, text).toStrictEqual([1, 2, 3]);
    }
  });

  test("CRLF の改行を受理する", async ({ expect }) => {
    // 準備
    const json = new Json();

    // 実行
    const result = await pumpThrough(json.getDecodable(), [jsonLines('1\r\n2\r\n"a"\r\n')]);

    // 検証
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(result.outputChunks).toStrictEqual([1, 2, "a"]);
  });

  test("空行は読み飛ばす", async ({ expect }) => {
    // 準備
    const json = new Json();
    const cases: [string, unknown[]][] = [
      ["\n\n1\n\n2\n", [1, 2]],
      ["1\r\n\r\n2\r\n", [1, 2]],
      ["\n", []],
      ["\r\n", []],
      ["\r", []],
    ];

    // 実行と検証
    for (const [text, expected] of cases) {
      const result = await pumpThrough(json.getDecodable(), [jsonLines(text)]);
      expect(result.writeError, JSON.stringify(text)).toBeUndefined();
      expect(result.readError, JSON.stringify(text)).toBeUndefined();
      expect(result.outputChunks, JSON.stringify(text)).toStrictEqual(expected);
    }
  });

  test("空のストリームは値を出力しない", async ({ expect }) => {
    // 準備
    const json = new Json();

    // 実行
    const empty = await pumpThrough(json.getDecodable(), []);
    const zeroBytes = await pumpThrough(json.getDecodable(), [new Uint8Array(0)]);

    // 検証
    expect(empty.writeError).toBeUndefined();
    expect(empty.readError).toBeUndefined();
    expect(empty.outputChunks).toStrictEqual([]);
    expect(zeroBytes.writeError).toBeUndefined();
    expect(zeroBytes.readError).toBeUndefined();
    expect(zeroBytes.outputChunks).toStrictEqual([]);
  });

  test("不正な行は SyntaxError で拒否される", async ({ expect }) => {
    // 準備
    const json = new Json();

    // 実行
    const result = await pumpThrough(json.getDecodable(), [jsonLines("1\n{bad}\n2\n")]);

    // 検証
    expect(result.writeError ?? result.readError).toBeInstanceOf(SyntaxError);
  });

  test("不正な UTF-8 は TypeError で拒否される", async ({ expect }) => {
    // 準備
    const json = new Json();
    const invalid = Uint8Array.from([0x31, 0x0a, 0xff, 0x0a]);
    const truncated = Uint8Array.from([0x31, 0x0a, 0xe3]);

    // 実行
    const invalidResult = await pumpThrough(json.getDecodable(), [invalid]);
    const truncatedResult = await pumpThrough(json.getDecodable(), [truncated]);

    // 検証
    expect(invalidResult.writeError ?? invalidResult.readError).toBeInstanceOf(TypeError);
    expect(truncatedResult.writeError ?? truncatedResult.readError).toBeInstanceOf(TypeError);
  });

  test("大きな値をチャンク境界をまたいでデコードできる", async ({ expect }) => {
    // 準備
    const json = new Json();
    const value = {
      text: "日本語😀".repeat(20_000),
      items: Array.from({ length: 1000 }, (_, index) => index),
    };
    const bytes = json.encode({ data: value });

    // 実行
    const result = await pumpThrough(json.getDecodable(), splitIntoChunks(bytes, 7));

    // 検証
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(result.outputChunks).toStrictEqual([value]);
  });

  test("読み取り側をキャンセルすると上流のソースもキャンセルされる", async ({ expect }) => {
    // 準備
    const json = new Json();
    let cancelled = false;
    const source = new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        controller.enqueue(jsonLines("1\n2\n"));
      },
      cancel() {
        cancelled = true;
      },
    });
    const stream = source.pipeThrough(json.getDecodable());
    const reader = stream.getReader();

    // 実行
    const first = await reader.read();
    await reader.cancel();
    // キャンセルは非同期に上流へ伝播するため、伝播の完了を待ちます。
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    // 検証
    expect(first.value).toBe(1);
    expect(cancelled).toBe(true);
  });
});

describe("ストリームの往復", () => {
  test("pipeThrough で encode と decode を往復すると元の値に戻る", async ({ expect }) => {
    // 準備
    const json = new Json();
    const values: unknown[] = [
      { id: 1, name: "日本語😀" },
      [null, true, false, 0, ""],
      "line\nbreak",
    ];

    // 実行
    const decoded = await readAll(
      sourceFrom(values).pipeThrough(json.getEncodable()).pipeThrough(json.getDecodable()),
    );

    // 検証
    expect(decoded).toStrictEqual(values);
  });

  test("出力チャンクの連結を一括 decode すると先頭の値に戻る", async ({ expect }) => {
    // 準備
    const json = new Json();
    const value = { a: 1, b: [2, 3] };

    // 実行
    const encoded = await pumpThrough(json.getEncodable(), [value]);
    const decoded = json.decode({ data: concatBytes(encoded.outputChunks) });

    // 検証
    expect(encoded.writeError).toBeUndefined();
    expect(encoded.readError).toBeUndefined();
    expect(decoded).toStrictEqual(value);
  });

  test("一括 encode した結果を小さなチャンクで decode できる", async ({ expect }) => {
    // 準備
    const json = new Json();
    const value = Array.from({ length: 100 }, () => "値😀");

    // 実行
    const encoded = json.encode({ data: value });
    const result = await pumpThrough(json.getDecodable(), splitIntoChunks(encoded, 3));

    // 検証
    expect(result.writeError).toBeUndefined();
    expect(result.readError).toBeUndefined();
    expect(result.outputChunks).toStrictEqual([value]);
  });
});
