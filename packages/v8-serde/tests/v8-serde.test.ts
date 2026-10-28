import type { IMiddleware } from "@unikvs/core";
import {
  bytesEqual,
  createNext,
  sourceFrom,
  concatBytes,
  captureRejection,
  createOpenContext,
  createDecodeContext,
  createEncodeContext,
  createEncodeStreamContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import { V8SerdeDecodeError, V8SerdeEncodeError } from "../src/errors.js";
import V8Serde from "../src/v8-serde.js";

/**
 * 開済みのターゲットを作成します。
 */
async function createOpenedTarget(signal: AbortSignal): Promise<V8Serde> {
  const target = new V8Serde();
  await target.open(createOpenContext({ signal }) as IMiddleware.OpenContext);

  return target;
}

/**
 * 値をシリアライズしてバイト列で返します。
 */
async function encode(target: V8Serde, data: unknown): Promise<Uint8Array<ArrayBuffer>> {
  const c = createEncodeContext(data);
  await target.encode(
    c as IMiddleware.EncodeContext<unknown, Uint8Array<ArrayBuffer>>,
    createNext(),
  );

  return c.destination;
}

/**
 * バイト列をデシリアライズして値を返します。
 */
async function decode(target: V8Serde, data: Uint8Array<ArrayBuffer>): Promise<unknown> {
  const c = createDecodeContext(data);
  await target.decode(
    c as IMiddleware.DecodeContext<Uint8Array<ArrayBuffer>, unknown>,
    createNext(),
  );

  return c.destination;
}

/**
 * 読み取り中に起きたエラーを握り潰さずに観測しつつ、読み取れたデータをすべて集めます。
 * ストリームの読み取り時のエラーを検証するために使用します。
 */
async function collectSettled<T>(stream: ReadableStream<T>): Promise<{
  readError: unknown;
  writeError: undefined;
  outputChunks: T[];
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

  return {
    readError,
    writeError: undefined,
    outputChunks,
  };
}

/**
 * 値の列をエンコードストリームに流し、出力されたチャンクを返します。
 */
function pumpEncode(
  target: V8Serde,
  values: readonly unknown[],
): Promise<{
  readError: unknown;
  writeError: undefined;
  outputChunks: Uint8Array<ArrayBuffer>[];
}> {
  const c = createEncodeStreamContext(sourceFrom(values));

  return target
    .encodeStream(
      c as IMiddleware.EncodeStreamContext<unknown, Uint8Array<ArrayBuffer>>,
      createNext(),
    )
    .then(() => collectSettled(c.destination as ReadableStream<Uint8Array<ArrayBuffer>>));
}

describe("初期化と基本属性", () => {
  test("name プロパティは V8Serde を返す", ({ expect }) => {
    // 実行と検証：
    expect(new V8Serde().name).toBe("V8Serde");
  });

  test("初期状態では isOpen が false である", ({ expect }) => {
    // 実行と検証：
    expect(new V8Serde().isOpen).toBe(false);
  });

  test("open 成功で isOpen が true になる", async ({ expect, signal }) => {
    // 準備：
    const target = new V8Serde();
    expect(target.isOpen).toBe(false);

    // 実行：
    await target.open(createOpenContext({ signal }) as IMiddleware.OpenContext);

    // 検証：
    expect(target.isOpen).toBe(true);
    expect(target.name).toBe("V8Serde");
  });

  test("encode と decode の後も name と isOpen は変化しない", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const encoded = await encode(target, { value: 1 });

    // 実行：
    await decode(target, encoded);

    // 検証：
    expect(target.name).toBe("V8Serde");
    expect(target.isOpen).toBe(true);
  });

  test("encode の結果は ArrayBuffer を裏に持つ Uint8Array である", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);

    // 実行：
    const encoded = await encode(target, { value: 1 });

    // 検証：
    expect(encoded).toBeInstanceOf(Uint8Array);
    expect(encoded.buffer).toBeInstanceOf(ArrayBuffer);
  });
});

describe("プリミティブ値のラウンドトリップ", () => {
  test.for([
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
  ])("%s を往復すると同じ値に戻る", async ([_label, input], { expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);

    // 実行：
    const output = await decode(target, await encode(target, input));

    // 検証：
    expect(output).toStrictEqual(input);
  });

  test("NaN を往復すると NaN に戻る", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);

    // 実行：
    const output = await decode(target, await encode(target, Number.NaN));

    // 検証：
    expect(Number.isNaN(output)).toBe(true);
  });

  test.for([
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
  ])("%s を往復すると同じ無限大に戻る", async ([_label, input], { expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);

    // 実行：
    const output = await decode(target, await encode(target, input));

    // 検証：
    expect(output).toBe(input);
  });

  test("-0 を往復すると -0 のまま戻る", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);

    // 実行：
    const output = await decode(target, await encode(target, -0));

    // 検証：
    expect(Object.is(output, -0)).toBe(true);
  });

  test("undefined を往復すると undefined に戻る", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);

    // 実行：
    const output = await decode(target, await encode(target, undefined));

    // 検証：
    expect(output).toBeUndefined();
  });

  test("オブジェクトと配列に含まれる undefined も保持される", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const input = {
      a: undefined,
      b: 1,
      c: [undefined, "x"],
    };

    // 実行：
    const output = (await decode(target, await encode(target, input))) as typeof input;

    // 検証：
    expect(output).toStrictEqual(input);
    expect(Object.hasOwn(output, "a")).toBe(true);
    expect(output.a).toBeUndefined();
  });

  test.for([
    ["0n", 0n],
    ["正の小さな bigint", 10n],
    ["負の小さな bigint", -10n],
    ["2^60", 1_152_921_504_606_846_976n],
    ["2^64-1", 18_446_744_073_709_551_615n],
    ["2^64", 18_446_744_073_709_551_616n],
    ["2^64 を超える値", 340_282_366_920_938_463_463_374_607_431_768_211_457n],
    ["-2^64", -18_446_744_073_709_551_616n],
    ["-2^64 を下回る値", -340_282_366_920_938_463_463_374_607_431_768_211_457n],
  ])("%s を往復すると bigint のまま戻る", async ([_label, input], { expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);

    // 実行：
    const output = await decode(target, await encode(target, input));

    // 検証：
    expect(typeof output).toBe("bigint");
    expect(output).toStrictEqual(input);
  });
});

describe("複合値のラウンドトリップ", () => {
  test("配列を往復すると同じ値に戻る", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const input = [1, "two", [true, null], { three: 3 }];

    // 実行：
    const output = await decode(target, await encode(target, input));

    // 検証：
    expect(output).toStrictEqual(input);
  });

  test("疎配列を往復すると hole が維持される", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const input: unknown[] = Array<unknown>(3);
    input[0] = 1;
    input[2] = 3;

    // 実行：
    const output = (await decode(target, await encode(target, input))) as unknown[];

    // 検証：
    expect(output).toHaveLength(3);
    expect(1 in output).toBe(false);
    expect(output[0]).toBe(1);
    expect(output[2]).toBe(3);
  });

  test("オブジェクトを往復すると同じ値に戻る", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const input = {
      list: [1, 2, 3],
      name: "unikvs",
      nested: {
        count: 2,
        enabled: true,
      },
    };

    // 実行：
    const output = await decode(target, await encode(target, input));

    // 検証：
    expect(output).toStrictEqual(input);
  });

  test.for([
    ["空の配列", []],
    ["空のオブジェクト", {}],
    ["空の Map", new Map()],
    ["空の Set", new Set()],
    ["空の Uint8Array", new Uint8Array(0)],
  ])("%s を往復すると同じ値に戻る", async ([_label, input], { expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);

    // 実行：
    const output = await decode(target, await encode(target, input));

    // 検証：
    expect(output).toStrictEqual(input);
  });

  test("Date を往復すると同じ時刻に戻る", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const input = new Date("2024-01-02T03:04:05.678Z");

    // 実行：
    const output = await decode(target, await encode(target, input));

    // 検証：
    expect(output).toBeInstanceOf(Date);
    expect(output).toStrictEqual(input);
  });

  test("Invalid Date を往復すると Invalid Date に戻る", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const input = new Date(Number.NaN);

    // 実行：
    const output = (await decode(target, await encode(target, input))) as Date;

    // 検証：
    expect(output).toBeInstanceOf(Date);
    expect(Number.isNaN(output.getTime())).toBe(true);
  });

  test("文字列キーの Map は Map として往復する", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const input = new Map<string, unknown>([
      ["a", 1],
      ["b", { c: 2 }],
    ]);

    // 実行：
    const output = await decode(target, await encode(target, input));

    // 検証：
    expect(output).toBeInstanceOf(Map);
    expect(output).toStrictEqual(input);
  });

  test("文字列以外をキーに持つ Map も Map として往復する", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const input = new Map<unknown, unknown>([
      [1, "one"],
      [true, false],
      [{ key: "object" }, [1, 2]],
    ]);

    // 実行：
    const output = await decode(target, await encode(target, input));

    // 検証：
    expect(output).toBeInstanceOf(Map);
    expect(output).toStrictEqual(input);
  });

  test("循環参照を持つ Map も往復する", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const input = new Map<unknown, unknown>();
    input.set("self", input);

    // 実行：
    const output = (await decode(target, await encode(target, input))) as Map<unknown, unknown>;

    // 検証：
    expect(output).toBeInstanceOf(Map);
    expect(output.get("self")).toBe(output);
  });

  test("Set を往復すると同じ要素に戻る", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const input = new Set<unknown>([1, "two", { three: 3 }, [4]]);

    // 実行：
    const output = await decode(target, await encode(target, input));

    // 検証：
    expect(output).toBeInstanceOf(Set);
    expect(output).toStrictEqual(input);
  });

  test("RegExp を往復すると同じパターンに戻る", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const input = /ab+c/giu;

    // 実行：
    const output = await decode(target, await encode(target, input));

    // 検証：
    expect(output).toBeInstanceOf(RegExp);
    expect(output).toStrictEqual(input);
  });

  test.for([
    ["Error", (): Error => new Error("something went wrong"), "Error"],
    ["TypeError", (): Error => new TypeError("bad type"), "TypeError"],
    ["RangeError", (): Error => new RangeError("out of range"), "RangeError"],
  ] as [string, () => Error, string][])(
    "%s を往復すると名前とメッセージが戻る",
    async ([_label, create, name], { expect, signal }) => {
      // 準備：
      const target = await createOpenedTarget(signal);
      const input = create();

      // 実行：
      const output = (await decode(target, await encode(target, input))) as Error;

      // 検証：
      expect(output).toBeInstanceOf(Error);
      expect(output.name).toBe(name);
      expect(output.message).toBe(input.message);
    },
  );

  test.for([
    ["Uint8Array", Uint8Array.of(0, 1, 2, 253, 254, 255)],
    ["Int16Array", Int16Array.of(-2, -1, 0, 1, 2)],
    ["Float64Array", Float64Array.of(1.5, -2.25, Number.POSITIVE_INFINITY)],
  ] as [string, Uint8Array | Int16Array | Float64Array][])(
    "%s を往復すると同じバイト列に戻る",
    async ([_label, input], { expect, signal }) => {
      // 準備：
      const target = await createOpenedTarget(signal);

      // 実行：
      const output = await decode(target, await encode(target, input));

      // 検証：
      expect(output).toBeInstanceOf(input.constructor);
      expect(output).toStrictEqual(input);
    },
  );

  test("DataView を往復すると同じ内容に戻る", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const input = new DataView(Uint8Array.of(9, 8, 7).buffer);

    // 実行：
    const output = (await decode(target, await encode(target, input))) as DataView;

    // 検証：
    expect(output).toBeInstanceOf(DataView);
    expect(output.byteLength).toBe(3);
    expect(output.getUint8(0)).toBe(9);
  });

  test("ArrayBuffer を往復すると同じ内容に戻る", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const input = Uint8Array.of(5, 6, 7).buffer;

    // 実行：
    const output = (await decode(target, await encode(target, input))) as ArrayBuffer;

    // 検証：
    expect(output).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(output)).toStrictEqual(Uint8Array.of(5, 6, 7));
  });

  test("Buffer を往復すると Buffer に戻る", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const input = Buffer.from([1, 2, 3]);

    // 実行：
    const output = (await decode(target, await encode(target, input))) as Buffer;

    // 検証：
    expect(output).toBeInstanceOf(Buffer);
    expect([...output]).toStrictEqual([1, 2, 3]);
  });

  test("1 MiB のバイト列を往復すると同じバイト列に戻る", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const input = new Uint8Array(1024 * 1024);

    for (let index = 0; index < input.length; index++) {
      input[index] = index % 251;
    }

    // 実行：
    const encoded = await encode(target, input);
    const output = (await decode(target, encoded)) as Uint8Array;

    // 検証：
    expect(encoded).toBeInstanceOf(Uint8Array);
    expect(encoded.buffer).toBeInstanceOf(ArrayBuffer);
    expect(output).toBeInstanceOf(Uint8Array);
    // 1 MiB のデータを toStrictEqual で比較すると遅いため bytesEqual を使います。
    expect(bytesEqual(output, input)).toBe(true);
  });

  test("循環参照を往復すると循環が維持される", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const input: {
      self?: unknown;
      value: number;
    } = { value: 1 };
    input.self = input;

    // 実行：
    const output = (await decode(target, await encode(target, input))) as typeof input;

    // 検証：
    expect(output.value).toBe(1);
    expect(output.self).toBe(output);
  });

  test("クラスのインスタンスはプレーンオブジェクトとして往復する", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);

    class Foo {
      public value = 1;
    }

    const input = new Foo();

    // 実行：
    const output = (await decode(target, await encode(target, input))) as Record<string, unknown>;

    // 検証：
    expect(output.constructor.name).toBe("Object");
    expect(output).toStrictEqual({ value: 1 });
  });

  test("シンボルをキーに持つプロパティーは取り除かれる", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const input = {
      [Symbol("hidden")]: 1,
      visible: 2,
    };

    // 実行：
    const output = (await decode(target, await encode(target, input))) as Record<string, unknown>;

    // 検証：
    expect(output).toStrictEqual({ visible: 2 });
    expect(Object.getOwnPropertySymbols(output)).toStrictEqual([]);
  });
});

describe("デコード結果の所有権", () => {
  test("プールを共有する Buffer からデコードした型付き配列は元のバッファーを参照しない", async ({
    expect,
    signal,
  }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const input = Uint8Array.of(1, 2, 3, 4);
    const encoded = await encode(target, input);
    const pool = Buffer.alloc(encoded.byteLength + 32);
    const source = pool.subarray(16, 16 + encoded.byteLength);
    source.set(encoded);

    // 実行：
    const output = (await decode(target, source)) as Uint8Array;

    // 検証：
    expect(output).toBeInstanceOf(Uint8Array);
    expect(output.buffer).not.toBe(pool.buffer);
  });

  test("デコード後に元の Buffer を書き換えても結果は変化しない", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const input = Uint8Array.of(1, 2, 3, 4);
    const encoded = await encode(target, input);
    const pool = Buffer.alloc(encoded.byteLength + 32);
    const source = pool.subarray(16, 16 + encoded.byteLength);
    source.set(encoded);

    // 実行：
    const output = (await decode(target, source)) as Uint8Array;

    pool.fill(255);

    // 検証：
    expect(output).toStrictEqual(input);
  });
});

describe("単発の trailing の扱い", () => {
  test("2 つの値の連結をデコードすると先頭の値だけが返る", async ({ expect, signal }) => {
    // 注意 : Node.js v24 での実測に基づく仕様ピンです。
    // Node.js を更新して赤くなった場合は仕様の再確認の合図とし、むやみに更新しません。
    // 準備：
    const target = await createOpenedTarget(signal);
    const input = concatBytes([await encode(target, 1), await encode(target, 2)]);

    // 実行：
    const output = await decode(target, input);

    // 検証：
    expect(output).toBe(1);
  });
});

describe("デコードの異常系", () => {
  test("空のバイト列は V8SerdeDecodeError を投げる", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const input = new Uint8Array(0);

    // 実行：
    const thrown = await captureRejection(decode(target, input));

    // 検証：
    expect(thrown).toBeInstanceOf(V8SerdeDecodeError);
    expect(((thrown as V8SerdeDecodeError).cause as Error).message).toContain(
      "Unable to deserialize cloned data",
    );
  });

  test("不正な先頭バイト列は V8SerdeDecodeError を投げる", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const input = Uint8Array.of(0, 1, 2, 3);

    // 実行：
    const thrown = await captureRejection(decode(target, input));

    // 検証：
    expect(thrown).toBeInstanceOf(V8SerdeDecodeError);
    expect((thrown as V8SerdeDecodeError).cause).toBeInstanceOf(Error);
    expect(((thrown as V8SerdeDecodeError).cause as Error).message).toContain(
      "Unable to deserialize cloned data",
    );
  });

  test("末尾が欠けたバイト列は V8SerdeDecodeError を投げる", async ({ expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);
    const encoded = await encode(target, { value: "hello" });
    const input = encoded.subarray(0, encoded.byteLength - 1);

    // 実行：
    const thrown = await captureRejection(decode(target, input));

    // 検証：
    expect(thrown).toBeInstanceOf(V8SerdeDecodeError);
    expect((thrown as V8SerdeDecodeError).cause).toBeInstanceOf(Error);
    expect(((thrown as V8SerdeDecodeError).cause as Error).message).toContain(
      "Unable to deserialize cloned data",
    );
  });

  test("ストリームの出力を単発でデコードすると V8SerdeDecodeError を投げる", async ({
    expect,
    signal,
  }) => {
    // 準備 : 先頭の 4 バイトは長さヘッダーのため、バージョン検査で失敗します。
    const target = await createOpenedTarget(signal);
    const { outputChunks } = await pumpEncode(target, [1]);
    const input = concatBytes(outputChunks);

    // 実行：
    const thrown = await captureRejection(decode(target, input));

    // 検証：
    expect(thrown).toBeInstanceOf(V8SerdeDecodeError);
    expect((thrown as V8SerdeDecodeError).cause).toBeInstanceOf(Error);
  });
});

describe("エンコードの異常系", () => {
  test.for([
    ["ルートの関数", (): void => {}],
    ["ルートのシンボル", Symbol("value")],
    ["ルートの WeakMap", new WeakMap()],
    ["ルートの WeakSet", new WeakSet()],
    ["ルートの Promise", Promise.resolve()],
    ["ルートの SharedArrayBuffer", new SharedArrayBuffer(8)],
    ["オブジェクトに含まれる関数", { value: (): void => {} }],
    ["オブジェクトに含まれるシンボル", { value: Symbol("value") }],
    ["配列に含まれる関数", [(): void => {}]],
    ["配列に含まれるシンボル", [Symbol("value")]],
  ])("%s は V8SerdeEncodeError を投げる", async ([_label, input], { expect, signal }) => {
    // 準備：
    const target = await createOpenedTarget(signal);

    // 実行：
    const thrown = await captureRejection(encode(target, input));

    // 検証：
    expect(thrown).toBeInstanceOf(V8SerdeEncodeError);
    expect((thrown as V8SerdeEncodeError).cause).toBeInstanceOf(Error);
    expect(((thrown as V8SerdeEncodeError).cause as Error).message).toContain(
      "could not be cloned",
    );
  });
});
