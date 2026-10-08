import { describe, test as vitest } from "vitest";

import Memory from "../src/memory.js";

/**
 * テストごとに空の Memory インスタンスを提供します。
 * 保存できる値の種類と境界値を検証するために使用します。
 */
const test = vitest.extend<{ storage: Memory }>({
  // oxlint-disable-next-line no-empty-pattern
  async storage({}, use) {
    await use(new Memory());
  },
});

/**
 * 関数を実行して投げられた例外を返します。
 * structuredClone が投げる DOMException の名前を検証するために使用します。
 */
function captureThrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }

  throw new Error("例外が投げられませんでした");
}

const primitiveValues: readonly { readonly label: string; readonly value: unknown }[] = [
  { label: "文字列", value: "hello" },
  { label: "整数", value: 42 },
  { label: "小数", value: 3.14 },
  { label: "真偽値", value: true },
  { label: "BigInt", value: 9007199254740993n },
  { label: "null", value: null },
  { label: "undefined", value: undefined },
];

describe("プリミティブ値", () => {
  for (const { label, value } of primitiveValues) {
    test(`${label} を保存したとき、同じ値として取得できる`, ({ expect, storage }) => {
      // 実行
      storage.write({ vars: {}, key: "k1", data: value });

      // 検証
      expect(storage.read({ key: "k1" })).toBe(value);
    });
  }

  test("NaN を保存しても NaN として取得できる", ({ expect, storage }) => {
    // 実行
    storage.write({ vars: {}, key: "k1", data: Number.NaN });

    // 検証
    expect(storage.read({ key: "k1" })).toBe(Number.NaN);
  });

  test("Infinity と -Infinity を保存できる", ({ expect, storage }) => {
    // 実行
    storage.write({ vars: {}, key: "positive", data: Number.POSITIVE_INFINITY });
    storage.write({ vars: {}, key: "negative", data: Number.NEGATIVE_INFINITY });

    // 検証
    expect(storage.read({ key: "positive" })).toBe(Number.POSITIVE_INFINITY);
    expect(storage.read({ key: "negative" })).toBe(Number.NEGATIVE_INFINITY);
  });

  test("0 と -0 は区別して保存される", ({ expect, storage }) => {
    // 実行
    storage.write({ vars: {}, key: "zero", data: 0 });
    storage.write({ vars: {}, key: "negative-zero", data: -0 });

    // 検証
    expect(storage.read({ key: "zero" })).toBe(0);
    expect(Object.is(storage.read({ key: "negative-zero" }), -0)).toBe(true);
  });
});

describe("複合値", () => {
  test("ネストしたオブジェクトと配列を保存できる", ({ expect, storage }) => {
    // 準備
    const value = { list: [1, "two", { three: true }], nested: { deep: null } };

    // 実行
    storage.write({ vars: {}, key: "k1", data: value });

    // 検証
    expect(storage.read({ key: "k1" })).toStrictEqual(value);
  });

  test("Date を保存したとき、複製された同じ日時を取得できる", ({ expect, storage }) => {
    // 準備
    const value = new Date("2024-01-02T03:04:05.678Z");

    // 実行
    storage.write({ vars: {}, key: "k1", data: value });
    const result = storage.read({ key: "k1" });

    // 検証
    expect(result).toStrictEqual(value);
    expect(result).not.toBe(value);
  });

  test("Map を保存したとき、複製された同じ内容を取得できる", ({ expect, storage }) => {
    // 準備
    const value = new Map<string, number>([
      ["a", 1],
      ["b", 2],
    ]);

    // 実行
    storage.write({ vars: {}, key: "k1", data: value });
    const result = storage.read({ key: "k1" });

    // 検証
    expect(result).toBeInstanceOf(Map);
    expect(result).toStrictEqual(value);
    expect(result).not.toBe(value);
  });

  test("Set を保存したとき、複製された同じ内容を取得できる", ({ expect, storage }) => {
    // 準備
    const value = new Set([1, 2, 3]);

    // 実行
    storage.write({ vars: {}, key: "k1", data: value });
    const result = storage.read({ key: "k1" });

    // 検証
    expect(result).toBeInstanceOf(Set);
    expect(result).toStrictEqual(value);
    expect(result).not.toBe(value);
  });

  test("Error を保存したとき、元のエラーと独立した複製を取得できる", ({ expect, storage }) => {
    // 準備
    const value = new Error("boom");

    // 実行
    storage.write({ vars: {}, key: "k1", data: value });
    const result = storage.read({ key: "k1" });

    // 検証
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe("boom");
    expect(result).not.toBe(value);
  });

  test("循環参照を持つオブジェクトを保存できる", ({ expect, storage }) => {
    // 準備
    type Node = { name: string; self?: Node };
    const value: Node = { name: "root" };
    value.self = value;

    // 実行
    storage.write({ vars: {}, key: "k1", data: value });
    const result = storage.read({ key: "k1" }) as Node;

    // 検証
    expect(result.name).toBe("root");
    expect(result.self).toBe(result);
    expect(result).not.toBe(value);
  });
});

const byteCases: readonly { readonly label: string; readonly bytes: Uint8Array }[] = [
  { label: "空", bytes: new Uint8Array(0) },
  { label: "すべて 0x00", bytes: new Uint8Array(16) },
  { label: "すべて 0xff", bytes: new Uint8Array(16).fill(0xff) },
  { label: "0 から 255 の連番", bytes: Uint8Array.from({ length: 256 }, (_, i) => i) },
];

describe("Uint8Array", () => {
  for (const { label, bytes } of byteCases) {
    test(`${label} の Uint8Array を byte-for-byte で保存できる`, ({ expect, storage }) => {
      // 実行
      storage.write({ vars: {}, key: "k1", data: bytes });
      const result = storage.read({ key: "k1" });

      // 検証
      expect(result).toStrictEqual(bytes);
      expect(result).not.toBe(bytes);
    });
  }

  test("ArrayBuffer のビューを保存したとき、ビューの範囲だけが複製される", ({
    expect,
    storage,
  }) => {
    // 準備
    const buffer = new Uint8Array([0, 1, 2, 3]).buffer;
    const view = new Uint8Array(buffer, 1, 2);

    // 実行
    storage.write({ vars: {}, key: "k1", data: view });

    // 検証
    expect(storage.read({ key: "k1" })).toStrictEqual(new Uint8Array([1, 2]));
  });
});

describe("複製できない値", () => {
  test("関数を書き込むと DataCloneError を投げ、保存されない", ({ expect, storage }) => {
    // 準備
    const fn = () => {};

    // 実行
    const error = captureThrown(() => storage.write({ vars: {}, key: "fn", data: fn }));

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("DataCloneError");
    expect(storage.exists({ key: "fn" })).toBe(false);
  });

  test("シンボルを書き込むと DataCloneError を投げ、保存されない", ({ expect, storage }) => {
    // 準備
    const symbol = Symbol("value");

    // 実行
    const error = captureThrown(() => storage.write({ vars: {}, key: "sym", data: symbol }));

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("DataCloneError");
    expect(storage.exists({ key: "sym" })).toBe(false);
  });

  test("複製に失敗しても既存の値は残る", ({ expect, storage }) => {
    // 準備
    storage.write({ vars: {}, key: "k1", data: "old" });

    // 実行
    captureThrown(() => storage.write({ vars: {}, key: "k1", data: () => {} }));

    // 検証
    expect(storage.read({ key: "k1" })).toBe("old");
  });
});
