import { describe, expect, test } from "vitest";

import { V8SerdeDecodeError, V8SerdeEncodeError } from "../src/errors.js";
import V8Serde from "../src/v8-serde.js";
import { concatBytes, pumpThrough } from "./helpers.js";

const v8serde = new V8Serde();

/**
 * 値を v8 のバイト列へ変換します。
 */
async function encode(data: unknown): Promise<Uint8Array<ArrayBuffer>> {
  return await v8serde.encode({ data });
}

/**
 * v8 のバイト列を値へ変換します。
 */
async function decode(data: Uint8Array<ArrayBuffer>): Promise<unknown> {
  return await v8serde.decode({ data });
}

describe("初期化と基本属性", () => {
  test("name プロパティは V8Serde を返す", ({ expect }) => {
    // 実行と検証
    expect(v8serde.name).toBe("V8Serde");
  });

  test("isOpen プロパティは常に true を返す", ({ expect }) => {
    // 実行と検証
    expect(v8serde.isOpen).toBe(true);
  });

  test("encode と decode の後も name と isOpen は変化しない", async ({ expect }) => {
    // 準備
    const encoded = await encode({ value: 1 });

    // 実行
    await decode(encoded);

    // 検証
    expect(v8serde.name).toBe("V8Serde");
    expect(v8serde.isOpen).toBe(true);
  });

  test("encode の結果は ArrayBuffer を裏に持つ Uint8Array である", async ({ expect }) => {
    // 実行
    const encoded = await encode({ value: 1 });

    // 検証
    expect(encoded).toBeInstanceOf(Uint8Array);
    expect(encoded.buffer).toBeInstanceOf(ArrayBuffer);
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
  ])("%s を往復すると同じ値に戻る", async (_label, input) => {
    // 実行
    const output = await decode(await encode(input));

    // 検証
    expect(output).toStrictEqual(input);
  });

  test("NaN を往復すると NaN に戻る", async ({ expect }) => {
    // 実行
    const output = await decode(await encode(NaN));

    // 検証
    expect(Number.isNaN(output)).toBe(true);
  });

  test.each([["Infinity"], ["-Infinity"]])("%s を往復すると同じ値に戻る", async (label) => {
    // 準備
    const input = label === "Infinity" ? Infinity : -Infinity;

    // 実行
    const output = await decode(await encode(input));

    // 検証
    expect(output).toBe(input);
  });

  test("-0 を往復すると -0 のまま戻る", async ({ expect }) => {
    // 実行
    const output = await decode(await encode(-0));

    // 検証
    expect(Object.is(output, -0)).toBe(true);
  });

  test("undefined を往復すると undefined に戻る", async ({ expect }) => {
    // 実行
    const output = await decode(await encode(undefined));

    // 検証
    expect(output).toBeUndefined();
  });

  test("オブジェクトと配列に含まれる undefined も保持される", async ({ expect }) => {
    // 準備
    const input = { a: undefined, b: 1, c: [undefined, "x"] };

    // 実行
    const output = (await decode(await encode(input))) as typeof input;

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
  ])("%s を往復すると bigint のまま戻る", async (_label, input) => {
    // 実行
    const output = await decode(await encode(input));

    // 検証
    expect(typeof output).toBe("bigint");
    expect(output).toStrictEqual(input);
  });
});

describe("複合値のラウンドトリップ", () => {
  test("配列を往復すると同じ値に戻る", async ({ expect }) => {
    // 準備
    const input = [1, "two", [true, null], { three: 3 }];

    // 実行
    const output = await decode(await encode(input));

    // 検証
    expect(output).toStrictEqual(input);
  });

  test("疎配列を往復すると hole が維持される", async ({ expect }) => {
    // 準備
    const input: unknown[] = Array<unknown>(3);
    input[0] = 1;
    input[2] = 3;

    // 実行
    const output = (await decode(await encode(input))) as unknown[];

    // 検証
    expect(output).toHaveLength(3);
    expect(1 in output).toBe(false);
    expect(output[0]).toBe(1);
    expect(output[2]).toBe(3);
  });

  test("オブジェクトを往復すると同じ値に戻る", async ({ expect }) => {
    // 準備
    const input = {
      name: "unikvs",
      nested: { enabled: true, count: 2 },
      list: [1, 2, 3],
    };

    // 実行
    const output = await decode(await encode(input));

    // 検証
    expect(output).toStrictEqual(input);
  });

  test.each([
    ["空の配列", []],
    ["空のオブジェクト", {}],
    ["空の Map", new Map()],
    ["空の Set", new Set()],
    ["空の Uint8Array", new Uint8Array(0)],
  ])("%s を往復すると同じ値に戻る", async (_label, input) => {
    // 実行
    const output = await decode(await encode(input));

    // 検証
    expect(output).toStrictEqual(input);
  });

  test("Date を往復すると同じ時刻に戻る", async ({ expect }) => {
    // 準備
    const input = new Date("2024-01-02T03:04:05.678Z");

    // 実行
    const output = await decode(await encode(input));

    // 検証
    expect(output).toBeInstanceOf(Date);
    expect(output).toStrictEqual(input);
  });

  test("Invalid Date を往復すると Invalid Date に戻る", async ({ expect }) => {
    // 準備
    const input = new Date(Number.NaN);

    // 実行
    const output = (await decode(await encode(input))) as Date;

    // 検証
    expect(output).toBeInstanceOf(Date);
    expect(Number.isNaN(output.getTime())).toBe(true);
  });

  test("文字列キーの Map は Map として往復する", async ({ expect }) => {
    // 準備
    const input = new Map<string, unknown>([
      ["a", 1],
      ["b", { c: 2 }],
    ]);

    // 実行
    const output = await decode(await encode(input));

    // 検証
    expect(output).toBeInstanceOf(Map);
    expect(output).toStrictEqual(input);
  });

  test("文字列以外をキーに持つ Map も Map として往復する", async ({ expect }) => {
    // 準備
    const input = new Map<unknown, unknown>([
      [1, "one"],
      [true, false],
      [{ key: "object" }, [1, 2]],
    ]);

    // 実行
    const output = await decode(await encode(input));

    // 検証
    expect(output).toBeInstanceOf(Map);
    expect(output).toStrictEqual(input);
  });

  test("循環参照を持つ Map も往復する", async ({ expect }) => {
    // 準備
    const input = new Map<unknown, unknown>();
    input.set("self", input);

    // 実行
    const output = (await decode(await encode(input))) as Map<unknown, unknown>;

    // 検証
    expect(output).toBeInstanceOf(Map);
    expect(output.get("self")).toBe(output);
  });

  test("Set を往復すると同じ要素に戻る", async ({ expect }) => {
    // 準備
    const input = new Set<unknown>([1, "two", { three: 3 }, [4]]);

    // 実行
    const output = await decode(await encode(input));

    // 検証
    expect(output).toBeInstanceOf(Set);
    expect(output).toStrictEqual(input);
  });

  test("RegExp を往復すると同じパターンに戻る", async ({ expect }) => {
    // 準備
    const input = /ab+c/gi;

    // 実行
    const output = await decode(await encode(input));

    // 検証
    expect(output).toBeInstanceOf(RegExp);
    expect(output).toStrictEqual(input);
  });

  test.each([
    ["Error", () => new Error("something went wrong"), "Error"],
    ["TypeError", () => new TypeError("bad type"), "TypeError"],
    ["RangeError", () => new RangeError("out of range"), "RangeError"],
  ])("%s を往復すると名前とメッセージが戻る", async (_label, create, name) => {
    // 準備
    const input = create();

    // 実行
    const output = (await decode(await encode(input))) as Error;

    // 検証
    expect(output).toBeInstanceOf(Error);
    expect(output.name).toBe(name);
    expect(output.message).toBe(input.message);
  });

  test.each([
    ["Uint8Array", Uint8Array.of(0, 1, 2, 253, 254, 255)],
    ["Int16Array", Int16Array.of(-2, -1, 0, 1, 2)],
    ["Float64Array", Float64Array.of(1.5, -2.25, Number.POSITIVE_INFINITY)],
  ])("%s を往復すると同じバイト列に戻る", async (_label, input) => {
    // 実行
    const output = await decode(await encode(input));

    // 検証
    expect(output).toBeInstanceOf(input.constructor);
    expect(output).toStrictEqual(input);
  });

  test("DataView を往復すると同じ内容に戻る", async ({ expect }) => {
    // 準備
    const input = new DataView(Uint8Array.of(9, 8, 7).buffer);

    // 実行
    const output = (await decode(await encode(input))) as DataView;

    // 検証
    expect(output).toBeInstanceOf(DataView);
    expect(output.byteLength).toBe(3);
    expect(output.getUint8(0)).toBe(9);
  });

  test("ArrayBuffer を往復すると同じ内容に戻る", async ({ expect }) => {
    // 準備
    const input = Uint8Array.of(5, 6, 7).buffer as ArrayBuffer;

    // 実行
    const output = (await decode(await encode(input))) as ArrayBuffer;

    // 検証
    expect(output).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(output)).toStrictEqual(Uint8Array.of(5, 6, 7));
  });

  test("Buffer を往復すると Buffer に戻る", async ({ expect }) => {
    // 準備
    const input = Buffer.from([1, 2, 3]);

    // 実行
    const output = (await decode(await encode(input))) as Buffer;

    // 検証
    expect(output).toBeInstanceOf(Buffer);
    expect([...output]).toStrictEqual([1, 2, 3]);
  });

  test("1 MiB のバイト列を往復すると同じバイト列に戻る", async ({ expect }) => {
    // 準備
    const input = new Uint8Array(1024 * 1024);
    for (let index = 0; index < input.length; index++) {
      input[index] = index % 251;
    }

    // 実行
    const encoded = await encode(input);
    const output = await decode(encoded);

    // 検証
    expect(encoded).toBeInstanceOf(Uint8Array);
    expect(encoded.buffer).toBeInstanceOf(ArrayBuffer);
    expect(output).toStrictEqual(input);
  });

  test("循環参照を往復すると循環が維持される", async ({ expect }) => {
    // 準備
    const input: { value: number; self?: unknown } = { value: 1 };
    input.self = input;

    // 実行
    const output = (await decode(await encode(input))) as typeof input;

    // 検証
    expect(output.value).toBe(1);
    expect(output.self).toBe(output);
  });

  test("クラスのインスタンスはプレーンオブジェクトとして往復する", async ({ expect }) => {
    // 準備
    class Foo {
      public value = 1;
    }
    const input = new Foo();

    // 実行
    const output = (await decode(await encode(input))) as Record<string, unknown>;

    // 検証
    expect(output.constructor.name).toBe("Object");
    expect(output).toStrictEqual({ value: 1 });
  });

  test("シンボルをキーに持つプロパティーは取り除かれる", async ({ expect }) => {
    // 準備
    const input = { [Symbol("hidden")]: 1, visible: 2 };

    // 実行
    const output = (await decode(await encode(input))) as Record<string, unknown>;

    // 検証
    expect(output).toStrictEqual({ visible: 2 });
    expect(Object.getOwnPropertySymbols(output)).toStrictEqual([]);
  });
});

describe("単発の trailing の扱い", () => {
  test("2 つの値の連結をデコードすると先頭の値だけが返る", async ({ expect }) => {
    // 注意: Node.js v24 での実測に基づく仕様ピンです。
    // Node.js を更新して赤くなった場合は仕様の再確認の合図とし、むやみに更新しません。
    // 準備
    const input = concatBytes([await encode(1), await encode(2)]);

    // 実行
    const output = await decode(input);

    // 検証
    expect(output).toBe(1);
  });
});

describe("デコードの異常系", () => {
  test("空のバイト列は V8SerdeDecodeError を投げる", async ({ expect }) => {
    // 準備
    const input = new Uint8Array(0);

    // 実行
    const thrown = await decode(input).then(
      () => undefined,
      (error: unknown) => error,
    );

    // 検証
    expect(thrown).toBeInstanceOf(V8SerdeDecodeError);
    expect(((thrown as V8SerdeDecodeError).cause as Error).message).toContain(
      "Unable to deserialize cloned data",
    );
  });

  test("不正な先頭バイト列は V8SerdeDecodeError を投げる", async ({ expect }) => {
    // 準備
    const input = Uint8Array.of(0, 1, 2, 3);

    // 実行
    const thrown = await decode(input).then(
      () => undefined,
      (error: unknown) => error,
    );

    // 検証
    expect(thrown).toBeInstanceOf(V8SerdeDecodeError);
    expect((thrown as V8SerdeDecodeError).cause).toBeInstanceOf(Error);
    expect(((thrown as V8SerdeDecodeError).cause as Error).message).toContain(
      "Unable to deserialize cloned data",
    );
  });

  test("末尾が欠けたバイト列は V8SerdeDecodeError を投げる", async ({ expect }) => {
    // 準備
    const encoded = await encode({ value: "hello" });
    const input = encoded.subarray(0, encoded.byteLength - 1);

    // 実行
    const thrown = await decode(input).then(
      () => undefined,
      (error: unknown) => error,
    );

    // 検証
    expect(thrown).toBeInstanceOf(V8SerdeDecodeError);
    expect((thrown as V8SerdeDecodeError).cause).toBeInstanceOf(Error);
    expect(((thrown as V8SerdeDecodeError).cause as Error).message).toContain(
      "Unable to deserialize cloned data",
    );
  });

  test("ストリームの出力を単発でデコードすると V8SerdeDecodeError を投げる", async ({ expect }) => {
    // 準備: 先頭の 4 バイトは長さヘッダーのため、バージョン検査で失敗します。
    const { outputChunks } = await pumpThrough(await v8serde.getEncodable(), [1]);
    const input = concatBytes(outputChunks);

    // 実行
    const thrown = await decode(input).then(
      () => undefined,
      (error: unknown) => error,
    );

    // 検証
    expect(thrown).toBeInstanceOf(V8SerdeDecodeError);
    expect((thrown as V8SerdeDecodeError).cause).toBeInstanceOf(Error);
  });
});

describe("エンコードの異常系", () => {
  test.each([
    ["ルートの関数", () => {}],
    ["ルートのシンボル", Symbol("value")],
    ["ルートの WeakMap", new WeakMap()],
    ["ルートの WeakSet", new WeakSet()],
    ["ルートの Promise", Promise.resolve()],
    ["ルートの SharedArrayBuffer", new SharedArrayBuffer(8)],
    ["オブジェクトに含まれる関数", { value: () => {} }],
    ["オブジェクトに含まれるシンボル", { value: Symbol("value") }],
    ["配列に含まれる関数", [() => {}]],
    ["配列に含まれるシンボル", [Symbol("value")]],
  ])("%s は V8SerdeEncodeError を投げる", async (_label, input) => {
    // 実行
    const thrown = await encode(input).then(
      () => undefined,
      (error: unknown) => error,
    );

    // 検証
    expect(thrown).toBeInstanceOf(V8SerdeEncodeError);
    expect((thrown as V8SerdeEncodeError).cause).toBeInstanceOf(Error);
    expect(((thrown as V8SerdeEncodeError).cause as Error).message).toContain(
      "could not be cloned",
    );
  });
});
