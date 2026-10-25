import type { IMiddleware } from "@unikvs/core";
import {
  createNext,
  captureRejection,
  createDecodeContext,
  createEncodeContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

// oxlint-disable unicorn/number-literal-case
import { SuperjsonUnsupportedValueError } from "../src/errors.js";
import Superjson from "../src/superjson.js";

/**
 * 値をエンコードして SuperJSON ペイロードのバイト列を返します。
 */
async function encode(codec: Superjson, value: unknown): Promise<Uint8Array<ArrayBuffer>> {
  const c = createEncodeContext(value);
  await codec.encode(c as IMiddleware.EncodeContext, createNext());

  return c.destination;
}

/**
 * バイト列をデコードして値を返します。
 */
async function decode(codec: Superjson, data: Uint8Array<ArrayBuffer>): Promise<unknown> {
  const c = createDecodeContext(data);
  await codec.decode(c as IMiddleware.DecodeContext, createNext());

  return c.destination;
}

/**
 * 一括エンコードと一括デコードで値を往復させます。
 */
async function roundTrip(value: unknown): Promise<unknown> {
  const codec = new Superjson();

  return decode(codec, await encode(codec, value));
}

/**
 * 値をエンコードして UTF-8 文字列として返します。
 */
async function encodeText(value: unknown): Promise<string> {
  return new TextDecoder().decode(await encode(new Superjson(), value));
}

/**
 * SuperJSON でデータを保持できないクラスです。
 */
class Point {
  public x: number;

  public y: number;

  public constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
}

describe("Superjson", () => {
  test("name は Superjson で isOpen は true を返す", ({ expect }) => {
    // 準備：
    const codec = new Superjson();

    // 検証：
    expect(codec.name).toBe("Superjson");
    expect(codec.isOpen).toBe(true);
  });

  test("encode は SuperJSON ペイロードの UTF-8 バイト列を返す", async ({ expect }) => {
    // 準備：
    const codec = new Superjson();

    // 実行：
    const encoded = await encode(codec, { list: [1, true, null] });

    // 検証：
    expect(encoded).toBeInstanceOf(Uint8Array);
    expect(JSON.parse(new TextDecoder().decode(encoded))).toStrictEqual({
      json: { list: [1, true, null] },
    });
  });

  test("Date を往復すると同じ時刻の Date に戻る", async ({ expect }) => {
    // 準備：
    const date = new Date("2024-01-02T03:04:05.678Z");

    // 実行：
    const decoded = await roundTrip(date);

    // 検証：
    expect(decoded).toBeInstanceOf(Date);
    expect(decoded).toStrictEqual(date);
  });

  test("Map を往復すると入れ子の値も含めて元に戻る", async ({ expect }) => {
    // 準備：
    const map = new Map<unknown, unknown>([
      ["number", 1],
      ["date", new Date(0)],
      ["missing", undefined],
      ["nested", new Set([2, 3])],
    ]);

    // 実行：
    const decoded = await roundTrip(map);

    // 検証：
    expect(decoded).toBeInstanceOf(Map);
    expect(decoded).toStrictEqual(map);
  });

  test("Set を往復すると元に戻る", async ({ expect }) => {
    // 準備：
    const set = new Set<unknown>([1, "two", 3n, null]);

    // 実行：
    const decoded = await roundTrip(set);

    // 検証：
    expect(decoded).toBeInstanceOf(Set);
    expect(decoded).toStrictEqual(set);
  });

  test("BigInt を往復すると元に戻る", async ({ expect }) => {
    // 実行：
    const decoded = await roundTrip(123_456_789_012_345_678_901_234_567_890n);

    // 検証：
    expect(decoded).toBe(123_456_789_012_345_678_901_234_567_890n);
  });

  test("ルートの undefined を往復すると undefined に戻る", async ({ expect }) => {
    // 実行：
    const value: unknown = undefined;
    const encoded = await encodeText(value);
    const decoded = await roundTrip(value);

    // 検証：
    expect(encoded).toContain("undefined");
    expect(decoded).toBeUndefined();
  });

  test("入れ子の undefined を往復すると元に戻る", async ({ expect }) => {
    // 準備：
    const value = {
      list: [undefined, 2],
      missing: undefined,
      present: 1,
    };

    // 実行：
    const decoded = await roundTrip(value);

    // 検証：
    expect(decoded).toStrictEqual(value);
  });

  test("プリミティブと入れ子の配列・オブジェクトを往復する", async ({ expect }) => {
    // 準備：
    const value = {
      null: null,
      array: [1, "two", [true, null]],
      number: 42,
      object: { deep: { value: 3 } },
      string: "text",
      boolean: false,
    };

    // 実行：
    const decoded = await roundTrip(value);

    // 検証：
    expect(decoded).toStrictEqual(value);
  });

  test("Unicode 文字列を往復する", async ({ expect }) => {
    // 準備：
    const value = "日本語のテキストと絵文字 🎌 と制御文字 \u0000 と改行 \n";

    // 実行：
    const decoded = await roundTrip(value);

    // 検証：
    expect(decoded).toBe(value);
  });

  test("自己参照する循環参照を往復する", async ({ expect }) => {
    // 準備：
    const value: {
      name: string;
      self?: unknown;
    } = { name: "root" };
    value.self = value;

    // 実行：
    const decoded = (await roundTrip(value)) as typeof value;

    // 検証：
    expect(decoded.name).toBe("root");
    expect(decoded.self).toBe(decoded);
  });

  test("相互参照する循環参照を往復する", async ({ expect }) => {
    // 準備：
    const left: {
      name: string;
      right?: unknown;
    } = { name: "left" };
    const right: {
      left?: unknown;
      name: string;
    } = {
      left,
      name: "right",
    };
    left.right = right;

    // 実行：
    const decoded = (await roundTrip(left)) as typeof left;
    const decodedRight = decoded.right as typeof right;

    // 検証：
    expect(decodedRight.name).toBe("right");
    expect(decodedRight.left).toBe(decoded);
  });

  test("NaN・Infinity・-Infinity・-0 を往復する", async ({ expect }) => {
    // 準備：
    const value = [Number.NaN, Infinity, -Infinity, -0];

    // 実行：
    const decoded = (await roundTrip(value)) as number[];

    // 検証：
    expect(Number.isNaN(decoded[0])).toBe(true);
    expect(decoded[1]).toBe(Infinity);
    expect(decoded[2]).toBe(-Infinity);
    expect(Object.is(decoded[3], -0)).toBe(true);
  });

  test("Uint8Array を往復する", async ({ expect }) => {
    // 準備：
    const value = Uint8Array.from([0, 1, 127, 255]);

    // 実行：
    const decoded = await roundTrip(value);

    // 検証：
    expect(decoded).toBeInstanceOf(Uint8Array);
    expect(decoded).toStrictEqual(value);
  });

  test("RegExp を往復する", async ({ expect }) => {
    // 準備：
    const value = /ab+c/giu;

    // 実行：
    const decoded = await roundTrip(value);

    // 検証：
    expect(decoded).toBeInstanceOf(RegExp);
    expect((decoded as RegExp).source).toBe(value.source);
    expect((decoded as RegExp).flags).toBe(value.flags);
  });

  test("登録していないクラスのインスタンスはプレーンオブジェクトになる", async ({ expect }) => {
    // 実行：
    const decoded = await roundTrip(new Point(1, 2));

    // 検証：
    expect(decoded).not.toBeInstanceOf(Point);
    expect(decoded).toStrictEqual({
      x: 1,
      y: 2,
    });
  });

  test("入れ子の関数とシンボルのプロパティーは取り除かれる", async ({ expect }) => {
    // 準備：
    const value = {
      fn: (): number => 2,
      sym: Symbol("nested"),
      keep: 1,
    };

    // 実行：
    const decoded = await roundTrip(value);

    // 検証：
    expect(decoded).toStrictEqual({ keep: 1 });
  });

  test("ルートの関数は SuperjsonUnsupportedValueError を投げる", async ({ expect }) => {
    // 準備：
    const codec = new Superjson();

    // 実行：
    const thrown = await captureRejection(encode(codec, (): number => 1));

    // 検証：
    expect(thrown).toBeInstanceOf(SuperjsonUnsupportedValueError);
    expect((thrown as SuperjsonUnsupportedValueError).meta).toStrictEqual({ type: "function" });
    expect((thrown as Error).name).toBe("UniKvsSuperjsonUnsupportedValueError");
    expect((thrown as Error).message).toBe("Unsupported value type: function");
  });

  test("ルートのシンボルは SuperjsonUnsupportedValueError を投げる", async ({ expect }) => {
    // 準備：
    const codec = new Superjson();

    // 実行：
    const thrown = await captureRejection(encode(codec, Symbol("root")));

    // 検証：
    expect(thrown).toBeInstanceOf(SuperjsonUnsupportedValueError);
    expect((thrown as SuperjsonUnsupportedValueError).meta).toStrictEqual({ type: "symbol" });
  });

  test("空のバイト列の decode は SyntaxError を投げる", async ({ expect }) => {
    // 準備：
    const codec = new Superjson();

    // 実行と検証：
    await expect(decode(codec, new Uint8Array(0))).rejects.toThrow(SyntaxError);
  });

  test("不正な JSON の decode は SyntaxError を投げる", async ({ expect }) => {
    // 準備：
    const codec = new Superjson();
    const data = new TextEncoder().encode("{ invalid");

    // 実行と検証：
    await expect(decode(codec, data)).rejects.toThrow(SyntaxError);
  });

  test("不正な UTF-8 の decode は TypeError を投げる", async ({ expect }) => {
    // 準備：
    const codec = new Superjson();
    const data = Uint8Array.from([0xff, 0xfe]);

    // 実行と検証：
    await expect(decode(codec, data)).rejects.toThrow(TypeError);
  });
});
