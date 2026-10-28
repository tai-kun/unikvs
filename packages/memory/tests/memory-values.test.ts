import type { IStorage } from "@unikvs/core";
import {
  captureThrown,
  createGetContext,
  createHasContext,
  createSetContext,
} from "@unikvs/testing";
import { test as vitest, describe } from "vite-plus/test";

// oxlint-disable unicorn/number-literal-case
import Memory from "../src/memory.js";

/**
 * テストごとに空の Memory インスタンスを提供します。
 * 保存できる値の種類と境界値を検証するために使用します。
 */
const test = vitest.extend<{ storage: Memory }>({
  async storage({}, use) {
    await use(new Memory());
  },
});

const primitiveValues: readonly {
  readonly label: string;
  readonly value: unknown;
}[] = [
  {
    label: "文字列",
    value: "hello",
  },
  {
    label: "整数",
    value: 42,
  },
  {
    label: "小数",
    value: 3.14,
  },
  {
    label: "真偽値",
    value: true,
  },
  {
    label: "BigInt",
    value: 9_007_199_254_740_993n,
  },
  {
    label: "null",
    value: null,
  },
  {
    label: "undefined",
    value: undefined,
  },
];
describe("プリミティブ値", () => {
  for (const { label, value } of primitiveValues) {
    test(`${label} を保存したとき、同じ値として取得できる`, ({ expect, storage }) => {
      // 実行：
      storage.write(createSetContext("k1") as IStorage.WriteContext, value);

      // 検証：
      expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).toBe(value);
    });
  }

  test("NaN を保存しても NaN として取得できる", ({ expect, storage }) => {
    // 実行：
    storage.write(createSetContext("k1") as IStorage.WriteContext, Number.NaN);

    // 検証：
    expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).toBe(Number.NaN);
  });

  test("Infinity と -Infinity を保存できる", ({ expect, storage }) => {
    // 実行：
    storage.write(createSetContext("positive") as IStorage.WriteContext, Number.POSITIVE_INFINITY);
    storage.write(createSetContext("negative") as IStorage.WriteContext, Number.NEGATIVE_INFINITY);

    // 検証：
    expect(storage.read(createGetContext("positive") as IStorage.ReadContext)).toBe(
      Number.POSITIVE_INFINITY,
    );
    expect(storage.read(createGetContext("negative") as IStorage.ReadContext)).toBe(
      Number.NEGATIVE_INFINITY,
    );
  });

  test("0 と -0 は区別して保存される", ({ expect, storage }) => {
    // 実行：
    storage.write(createSetContext("zero") as IStorage.WriteContext, 0);
    storage.write(createSetContext("negative-zero") as IStorage.WriteContext, -0);

    // 検証：
    expect(storage.read(createGetContext("zero") as IStorage.ReadContext)).toBe(0);
    expect(
      Object.is(storage.read(createGetContext("negative-zero") as IStorage.ReadContext), -0),
    ).toBe(true);
  });
});
describe("複合値", () => {
  test("ネストしたオブジェクトと配列を保存できる", ({ expect, storage }) => {
    // 準備：
    const value = {
      list: [1, "two", { three: true }],
      nested: { deep: null },
    };

    // 実行：
    storage.write(createSetContext("k1") as IStorage.WriteContext, value);

    // 検証：
    expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).toStrictEqual(value);
  });

  test("Date を保存したとき、複製された同じ日時を取得できる", ({ expect, storage }) => {
    // 準備：
    const value = new Date("2024-01-02T03:04:05.678Z");

    // 実行：
    storage.write(createSetContext("k1") as IStorage.WriteContext, value);

    const result = storage.read(createGetContext("k1") as IStorage.ReadContext);

    // 検証：
    expect(result).toStrictEqual(value);
    expect(result).not.toBe(value);
  });

  test("Map を保存したとき、複製された同じ内容を取得できる", ({ expect, storage }) => {
    // 準備：
    const value = new Map<string, number>([
      ["a", 1],
      ["b", 2],
    ]);

    // 実行：
    storage.write(createSetContext("k1") as IStorage.WriteContext, value);

    const result = storage.read(createGetContext("k1") as IStorage.ReadContext);

    // 検証：
    expect(result).toBeInstanceOf(Map);
    expect(result).toStrictEqual(value);
    expect(result).not.toBe(value);
  });

  test("Set を保存したとき、複製された同じ内容を取得できる", ({ expect, storage }) => {
    // 準備：
    const value = new Set([1, 2, 3]);

    // 実行：
    storage.write(createSetContext("k1") as IStorage.WriteContext, value);

    const result = storage.read(createGetContext("k1") as IStorage.ReadContext);

    // 検証：
    expect(result).toBeInstanceOf(Set);
    expect(result).toStrictEqual(value);
    expect(result).not.toBe(value);
  });

  test("Error を保存したとき、元のエラーと独立した複製を取得できる", ({ expect, storage }) => {
    // 準備：
    const value = new Error("boom");

    // 実行：
    storage.write(createSetContext("k1") as IStorage.WriteContext, value);

    const result = storage.read(createGetContext("k1") as IStorage.ReadContext);

    // 検証：
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe("boom");
    expect(result).not.toBe(value);
  });

  test("循環参照を持つオブジェクトを保存できる", ({ expect, storage }) => {
    // 準備：
    type Node = {
      name: string;
      self?: Node;
    };

    const value: Node = { name: "root" };
    value.self = value;

    // 実行：
    storage.write(createSetContext("k1") as IStorage.WriteContext, value);

    const result = storage.read(createGetContext("k1") as IStorage.ReadContext) as Node;

    // 検証：
    expect(result.name).toBe("root");
    expect(result.self).toBe(result);
    expect(result).not.toBe(value);
  });
});

const byteCases: readonly {
  readonly bytes: Uint8Array;
  readonly label: string;
}[] = [
  {
    bytes: new Uint8Array(0),
    label: "空",
  },
  {
    bytes: new Uint8Array(16),
    label: "すべて 0x00",
  },
  {
    bytes: new Uint8Array(16).fill(0xff),
    label: "すべて 0xff",
  },
  {
    bytes: Uint8Array.from({ length: 256 }, (_, i) => i),
    label: "0 から 255 の連番",
  },
];
describe("Uint8Array", () => {
  for (const { bytes, label } of byteCases) {
    test(`${label} の Uint8Array を byte-for-byte で保存できる`, ({ expect, storage }) => {
      // 実行：
      storage.write(createSetContext("k1") as IStorage.WriteContext, bytes);
      const result = storage.read(createGetContext("k1") as IStorage.ReadContext);

      // 検証：
      expect(result).toStrictEqual(bytes);
      expect(result).not.toBe(bytes);
    });
  }

  test("ArrayBuffer のビューを保存したとき、ビューの範囲だけが複製される", ({
    expect,
    storage,
  }) => {
    // 準備：
    const buffer = new Uint8Array([0, 1, 2, 3]).buffer;
    const view = new Uint8Array(buffer, 1, 2);

    // 実行：
    storage.write(createSetContext("k1") as IStorage.WriteContext, view);

    // 検証：
    expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).toStrictEqual(
      new Uint8Array([1, 2]),
    );
  });
});

describe("複製できない値", () => {
  test("関数を書き込むと DataCloneError を投げ、保存されない", ({ expect, storage }) => {
    // 準備：
    // oxlint-disable-next-line unicorn/consistent-function-scoping
    const fn = (): void => {};

    // 実行：
    const error = captureThrown(() => {
      storage.write(createSetContext("fn") as IStorage.WriteContext, fn);
    });

    // 検証：
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("DataCloneError");

    expect(storage.exists(createHasContext("fn") as IStorage.ExistsContext)).toBe(false);
  });

  test("シンボルを書き込むと DataCloneError を投げ、保存されない", ({ expect, storage }) => {
    // 準備：
    const symbol = Symbol("value");

    // 実行：
    const error = captureThrown(() => {
      storage.write(createSetContext("sym") as IStorage.WriteContext, symbol);
    });

    // 検証：
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("DataCloneError");

    expect(storage.exists(createHasContext("sym") as IStorage.ExistsContext)).toBe(false);
  });

  test("複製に失敗しても既存の値は残る", ({ expect, storage }) => {
    // 準備：
    storage.write(createSetContext("k1") as IStorage.WriteContext, "old");

    // 実行：
    captureThrown(() => {
      storage.write(createSetContext("k1") as IStorage.WriteContext, () => {});
    });

    // 検証：
    expect(storage.read(createGetContext("k1") as IStorage.ReadContext)).toBe("old");
  });
});
