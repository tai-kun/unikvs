import { describe, test } from "vitest";

import { SuperjsonUnsupportedValueError } from "../src/errors.js";
import Superjson from "../src/superjson.js";

/**
 * 一括エンコードと一括デコードで値を往復させます。
 */
function roundTrip(value: unknown): unknown {
  const codec = new Superjson();

  return codec.decode({ data: codec.encode({ data: value }) });
}

/**
 * 値をエンコードして UTF-8 文字列として返します。
 */
function encodeText(value: unknown): string {
  return new TextDecoder().decode(new Superjson().encode({ data: value }));
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
    // 準備
    const codec = new Superjson();

    // 検証
    expect(codec.name).toBe("Superjson");
    expect(codec.isOpen).toBe(true);
  });

  test("encode は SuperJSON ペイロードの UTF-8 バイト列を返す", ({ expect }) => {
    // 準備
    const codec = new Superjson();

    // 実行
    const encoded = codec.encode({ data: { list: [1, true, null] } });

    // 検証
    expect(encoded).toBeInstanceOf(Uint8Array);
    expect(JSON.parse(new TextDecoder().decode(encoded))).toStrictEqual({
      json: { list: [1, true, null] },
    });
  });

  test("Date を往復すると同じ時刻の Date に戻る", ({ expect }) => {
    // 準備
    const date = new Date("2024-01-02T03:04:05.678Z");

    // 実行
    const decoded = roundTrip(date);

    // 検証
    expect(decoded).toBeInstanceOf(Date);
    expect(decoded).toStrictEqual(date);
  });

  test("Map を往復すると入れ子の値も含めて元に戻る", ({ expect }) => {
    // 準備
    const map = new Map<unknown, unknown>([
      ["number", 1],
      ["date", new Date(0)],
      ["missing", undefined],
      ["nested", new Set([2, 3])],
    ]);

    // 実行
    const decoded = roundTrip(map);

    // 検証
    expect(decoded).toBeInstanceOf(Map);
    expect(decoded).toStrictEqual(map);
  });

  test("Set を往復すると元に戻る", ({ expect }) => {
    // 準備
    const set = new Set<unknown>([1, "two", 3n, null]);

    // 実行
    const decoded = roundTrip(set);

    // 検証
    expect(decoded).toBeInstanceOf(Set);
    expect(decoded).toStrictEqual(set);
  });

  test("BigInt を往復すると元に戻る", ({ expect }) => {
    // 実行
    const decoded = roundTrip(123456789012345678901234567890n);

    // 検証
    expect(decoded).toBe(123456789012345678901234567890n);
  });

  test("ルートの undefined を往復すると undefined に戻る", ({ expect }) => {
    // 実行
    const encoded = encodeText(undefined);
    const decoded = roundTrip(undefined);

    // 検証
    expect(encoded).toContain("undefined");
    expect(decoded).toBeUndefined();
  });

  test("入れ子の undefined を往復すると元に戻る", ({ expect }) => {
    // 準備
    const value = { present: 1, missing: undefined, list: [undefined, 2] };

    // 実行
    const decoded = roundTrip(value);

    // 検証
    expect(decoded).toStrictEqual(value);
  });

  test("プリミティブと入れ子の配列・オブジェクトを往復する", ({ expect }) => {
    // 準備
    const value = {
      string: "text",
      number: 42,
      boolean: false,
      null: null,
      array: [1, "two", [true, null]],
      object: { deep: { value: 3 } },
    };

    // 実行
    const decoded = roundTrip(value);

    // 検証
    expect(decoded).toStrictEqual(value);
  });

  test("Unicode 文字列を往復する", ({ expect }) => {
    // 準備
    const value = "日本語のテキストと絵文字 🎌 と制御文字 \u0000 と改行 \n";

    // 実行
    const decoded = roundTrip(value);

    // 検証
    expect(decoded).toBe(value);
  });

  test("自己参照する循環参照を往復する", ({ expect }) => {
    // 準備
    const value: { name: string; self?: unknown } = { name: "root" };
    value.self = value;

    // 実行
    const decoded = roundTrip(value) as typeof value;

    // 検証
    expect(decoded.name).toBe("root");
    expect(decoded.self).toBe(decoded);
  });

  test("相互参照する循環参照を往復する", ({ expect }) => {
    // 準備
    const left: { name: string; right?: unknown } = { name: "left" };
    const right: { name: string; left?: unknown } = { name: "right", left };
    left.right = right;

    // 実行
    const decoded = roundTrip(left) as typeof left;
    const decodedRight = decoded.right as typeof right;

    // 検証
    expect(decodedRight.name).toBe("right");
    expect(decodedRight.left).toBe(decoded);
  });

  test("NaN・Infinity・-Infinity・-0 を往復する", ({ expect }) => {
    // 準備
    const value = [NaN, Infinity, -Infinity, -0];

    // 実行
    const decoded = roundTrip(value) as number[];

    // 検証
    expect(Number.isNaN(decoded[0]!)).toBe(true);
    expect(decoded[1]).toBe(Infinity);
    expect(decoded[2]).toBe(-Infinity);
    expect(Object.is(decoded[3], -0)).toBe(true);
  });

  test("Uint8Array を往復する", ({ expect }) => {
    // 準備
    const value = Uint8Array.from([0, 1, 127, 255]);

    // 実行
    const decoded = roundTrip(value);

    // 検証
    expect(decoded).toBeInstanceOf(Uint8Array);
    expect(decoded).toStrictEqual(value);
  });

  test("RegExp を往復する", ({ expect }) => {
    // 準備
    const value = /ab+c/giu;

    // 実行
    const decoded = roundTrip(value);

    // 検証
    expect(decoded).toBeInstanceOf(RegExp);
    expect((decoded as RegExp).source).toBe(value.source);
    expect((decoded as RegExp).flags).toBe(value.flags);
  });

  test("登録していないクラスのインスタンスはプレーンオブジェクトになる", ({ expect }) => {
    // 実行
    const decoded = roundTrip(new Point(1, 2));

    // 検証
    expect(decoded).not.toBeInstanceOf(Point);
    expect(decoded).toStrictEqual({ x: 1, y: 2 });
  });

  test("入れ子の関数とシンボルのプロパティーは取り除かれる", ({ expect }) => {
    // 準備
    const value = { keep: 1, fn: () => 2, sym: Symbol("nested") };

    // 実行
    const decoded = roundTrip(value);

    // 検証
    expect(decoded).toStrictEqual({ keep: 1 });
  });

  test("ルートの関数は SuperjsonUnsupportedValueError を投げる", ({ expect }) => {
    // 準備
    const codec = new Superjson();

    // 実行
    let thrown: unknown;
    try {
      codec.encode({ data: () => 1 });
    } catch (error) {
      thrown = error;
    }

    // 検証
    expect(thrown).toBeInstanceOf(SuperjsonUnsupportedValueError);
    expect((thrown as SuperjsonUnsupportedValueError).meta).toStrictEqual({ type: "function" });
    expect((thrown as Error).name).toBe("UniKvsSuperjsonUnsupportedValueError");
    expect((thrown as Error).message).toBe("Unsupported value type: function");
  });

  test("ルートのシンボルは SuperjsonUnsupportedValueError を投げる", ({ expect }) => {
    // 準備
    const codec = new Superjson();

    // 実行
    let thrown: unknown;
    try {
      codec.encode({ data: Symbol("root") });
    } catch (error) {
      thrown = error;
    }

    // 検証
    expect(thrown).toBeInstanceOf(SuperjsonUnsupportedValueError);
    expect((thrown as SuperjsonUnsupportedValueError).meta).toStrictEqual({ type: "symbol" });
  });

  test("空のバイト列の decode は SyntaxError を投げる", ({ expect }) => {
    // 準備
    const codec = new Superjson();

    // 実行と検証
    expect(() => codec.decode({ data: new Uint8Array(0) })).toThrow(SyntaxError);
  });

  test("不正な JSON の decode は SyntaxError を投げる", ({ expect }) => {
    // 準備
    const codec = new Superjson();
    const data = new TextEncoder().encode("{ invalid");

    // 実行と検証
    expect(() => codec.decode({ data })).toThrow(SyntaxError);
  });

  test("不正な UTF-8 の decode は TypeError を投げる", ({ expect }) => {
    // 準備
    const codec = new Superjson();
    const data = Uint8Array.from([0xff, 0xfe]);

    // 実行と検証
    expect(() => codec.decode({ data })).toThrow(TypeError);
  });
});
