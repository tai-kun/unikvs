import { describe, test } from "vitest";

import mergeContext from "../src/_merge-context.js";

describe("mergeContext", () => {
  test("2 つのオブジェクトをマージする", ({ expect }) => {
    // 準備
    const a = { x: 1, y: 2 };
    const b = { y: 3, z: 4 };

    // 実行
    const result = mergeContext(a, b);

    // 検証
    expect(result).toStrictEqual({ x: 1, y: 3, z: 4 });
  });

  test("b が undefined のとき、a のコピーを返す", ({ expect }) => {
    // 準備
    const a = { x: 1 };

    // 実行
    const result = mergeContext(a, undefined);

    // 検証
    expect(result).toStrictEqual({ x: 1 });
  });

  test("b がキーと値のペアの配列のとき、オブジェクトに変換してマージする", ({ expect }) => {
    // 準備
    const a = { x: 1 };
    const b = [
      ["y", 2],
      ["z", 3],
    ] as readonly [string, unknown][];

    // 実行
    const result = mergeContext(a, b);

    // 検証
    expect(result).toStrictEqual({ x: 1, y: 2, z: 3 });
  });

  test("元のオブジェクトが変更されない", ({ expect }) => {
    // 準備
    const a = { x: 1 };
    const b = { y: 2 };

    // 実行
    const result = mergeContext(a, b);

    // 検証
    expect(a).toStrictEqual({ x: 1 });
    expect(b).toStrictEqual({ y: 2 });
    expect(result).not.toBe(a);
    expect(result).not.toBe(b);
  });
});
