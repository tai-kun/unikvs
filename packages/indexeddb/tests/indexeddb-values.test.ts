import { describe } from "vitest";

import { captureRejection, test } from "./_helpers.js";

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
    test(`${label} を保存したとき、同じ値として取得できる`, async ({ expect, storage }) => {
      // 準備
      await storage.open();

      // 実行
      await storage.write({ key: "k1", data: value });

      // 検証
      expect(await storage.read({ key: "k1" })).toBe(value);
    });
  }

  test("NaN を保存したとき、exists は true を返す", async ({ expect, storage }) => {
    // 準備
    await storage.open();

    // 実行
    await storage.write({ key: "k1", data: Number.NaN });

    // 検証
    expect(await storage.exists({ key: "k1" })).toBe(true);
  });

  test("Infinity と -Infinity を保存できる", async ({ expect, storage }) => {
    // 準備
    await storage.open();

    // 実行
    await storage.write({ key: "positive", data: Number.POSITIVE_INFINITY });
    await storage.write({ key: "negative", data: Number.NEGATIVE_INFINITY });

    // 検証
    expect(await storage.read({ key: "positive" })).toBe(Number.POSITIVE_INFINITY);
    expect(await storage.read({ key: "negative" })).toBe(Number.NEGATIVE_INFINITY);
  });

  test("0 と -0 は区別して保存される", async ({ expect, storage }) => {
    // 準備
    await storage.open();

    // 実行
    await storage.write({ key: "zero", data: 0 });
    await storage.write({ key: "negative-zero", data: -0 });

    // 検証
    expect(await storage.read({ key: "zero" })).toBe(0);
    expect(Object.is(await storage.read({ key: "negative-zero" }), -0)).toBe(true);
  });
});

describe("複合値", () => {
  test("ネストしたオブジェクトと配列を保存できる", async ({ expect, storage }) => {
    // 準備
    await storage.open();
    const value = { list: [1, "two", { three: true }], nested: { deep: null } };

    // 実行
    await storage.write({ key: "k1", data: value });

    // 検証
    expect(await storage.read({ key: "k1" })).toStrictEqual(value);
  });

  test("Date を保存したとき、複製された同じ日時を取得できる", async ({ expect, storage }) => {
    // 準備
    await storage.open();
    const value = new Date("2024-01-02T03:04:05.678Z");

    // 実行
    await storage.write({ key: "k1", data: value });
    const result = await storage.read({ key: "k1" });

    // 検証
    expect(result).toStrictEqual(value);
    expect(result).not.toBe(value);
  });

  test("Map を保存したとき、複製された同じ内容を取得できる", async ({ expect, storage }) => {
    // 準備
    await storage.open();
    const value = new Map<string, number>([
      ["a", 1],
      ["b", 2],
    ]);

    // 実行
    await storage.write({ key: "k1", data: value });
    const result = await storage.read({ key: "k1" });

    // 検証
    expect(result).toBeInstanceOf(Map);
    expect(result).toStrictEqual(value);
    expect(result).not.toBe(value);
  });

  test("Set を保存したとき、複製された同じ内容を取得できる", async ({ expect, storage }) => {
    // 準備
    await storage.open();
    const value = new Set([1, 2, 3]);

    // 実行
    await storage.write({ key: "k1", data: value });
    const result = await storage.read({ key: "k1" });

    // 検証
    expect(result).toBeInstanceOf(Set);
    expect(result).toStrictEqual(value);
    expect(result).not.toBe(value);
  });

  test("RegExp を保存したとき、複製された同じパターンを取得できる", async ({ expect, storage }) => {
    // 準備
    await storage.open();
    const value = /abc/giu;

    // 実行
    await storage.write({ key: "k1", data: value });
    const result = await storage.read({ key: "k1" });

    // 検証
    expect(result).toBeInstanceOf(RegExp);
    expect(result.source).toBe(value.source);
    expect(result.flags).toBe(value.flags);
    expect(result).not.toBe(value);
  });

  test("Blob を保存したとき、複製された同じ内容を取得できる", async ({ expect, storage }) => {
    // 準備
    await storage.open();
    const value = new Blob(["hello", "world"], { type: "text/plain" });

    // 実行
    await storage.write({ key: "k1", data: value });
    const result = await storage.read({ key: "k1" });

    // 検証
    expect(result).toBeInstanceOf(Blob);
    expect(result.size).toBe(value.size);
    expect(result.type).toBe(value.type);
    expect(await result.text()).toBe("helloworld");
  });

  test("循環参照を持つオブジェクトを保存できる", async ({ expect, storage }) => {
    // 準備
    await storage.open();
    type Node = { name: string; self?: Node };
    const value: Node = { name: "root" };
    value.self = value;

    // 実行
    await storage.write({ key: "k1", data: value });
    const result = await storage.read({ key: "k1" });

    // 検証
    expect(result.name).toBe("root");
    expect(result.self).toBe(result);
    expect(result).not.toBe(value);
  });
});

describe("バイナリーデータ", () => {
  test("ArrayBuffer を byte-for-byte で保存できる", async ({ expect, storage }) => {
    // 準備
    await storage.open();
    const value = new Uint8Array([1, 2, 3, 255]).buffer;

    // 実行
    await storage.write({ key: "k1", data: value });
    const result = await storage.read({ key: "k1" });

    // 検証
    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(result)).toStrictEqual(new Uint8Array([1, 2, 3, 255]));
    expect(result).not.toBe(value);
  });

  test("Uint8Array を byte-for-byte で保存できる", async ({ expect, storage }) => {
    // 準備
    await storage.open();
    const value = new Uint8Array([0, 1, 2, 255]);

    // 実行
    await storage.write({ key: "k1", data: value });
    const result = await storage.read({ key: "k1" });

    // 検証
    expect(result).toStrictEqual(value);
    expect(result).not.toBe(value);
  });

  test("Uint8Array のビューを保存したとき、ビューの範囲だけが複製される", async ({
    expect,
    storage,
  }) => {
    // 準備
    await storage.open();
    const buffer = new Uint8Array([0, 1, 2, 3]).buffer;
    const view = new Uint8Array(buffer, 1, 2);

    // 実行
    await storage.write({ key: "k1", data: view });

    // 検証
    expect(await storage.read({ key: "k1" })).toStrictEqual(new Uint8Array([1, 2]));
  });

  test("複数 MiB の文字列を保存できる", async ({ expect, storage }) => {
    // 準備
    await storage.open();
    const value = "a".repeat(3 * 1024 * 1024);

    // 実行
    await storage.write({ key: "k1", data: value });
    const result = await storage.read({ key: "k1" });

    // 検証
    expect(result.length).toBe(value.length);
    expect(result).toBe(value);
  });

  test("複数 MiB の Uint8Array を byte-for-byte で保存できる", async ({ expect, storage }) => {
    // 準備
    await storage.open();
    const size = 3 * 1024 * 1024;
    const value = new Uint8Array(size);
    value[0] = 1;
    value[size - 1] = 2;

    // 実行
    await storage.write({ key: "k1", data: value });
    const result = await storage.read({ key: "k1" });

    // 検証
    expect(result.length).toBe(size);
    expect(result[0]).toBe(1);
    expect(result[size - 1]).toBe(2);
    expect(result).toStrictEqual(value);
  });
});

describe("複製できない値", () => {
  test("関数を書き込むと DataCloneError で拒否され、保存されない", async ({ expect, storage }) => {
    // 準備
    await storage.open();

    // 実行
    const error = await captureRejection(storage.write({ key: "fn", data: () => {} }));

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("DataCloneError");
    expect(await storage.exists({ key: "fn" })).toBe(false);
  });

  test("シンボルを書き込むと DataCloneError で拒否され、保存されない", async ({
    expect,
    storage,
  }) => {
    // 準備
    await storage.open();
    const symbol = Symbol("value");

    // 実行
    const error = await captureRejection(storage.write({ key: "sym", data: symbol }));

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("DataCloneError");
    expect(await storage.exists({ key: "sym" })).toBe(false);
  });

  test("関数を含むオブジェクトを書き込むと DataCloneError で拒否される", async ({
    expect,
    storage,
  }) => {
    // 準備
    await storage.open();

    // 実行
    const error = await captureRejection(
      storage.write({ key: "nested", data: { callback: () => {} } }),
    );

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("DataCloneError");
    expect(await storage.exists({ key: "nested" })).toBe(false);
  });

  test("複製に失敗しても既存の値は上書きされない", async ({ expect, storage }) => {
    // 準備
    await storage.open();
    await storage.write({ key: "k1", data: "old" });

    // 実行
    const error = await captureRejection(storage.write({ key: "k1", data: () => {} }));

    // 検証
    expect(error).toBeInstanceOf(DOMException);
    expect(await storage.read({ key: "k1" })).toBe("old");
  });
});
