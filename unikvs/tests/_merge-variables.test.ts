import { ReadonlyVariableError, Variables } from "@unikvs/core";
import { describe, test } from "vitest";

import mergeVariables from "../src/_merge-variables.js";

describe("mergeVariables", () => {
  test("2 つのオブジェクトをマージする", ({ expect }) => {
    // 準備
    const a = new Variables({ x: 1, y: 2 });
    const b = { y: 3, z: 4 };

    // 実行
    const result = mergeVariables(a, b);

    // 検証
    expect(result).toBeInstanceOf(Variables);
    expect(result.toJSON()).toStrictEqual({ x: 1, y: 3, z: 4 });
  });

  test("b が undefined のとき、a のコピーを返す", ({ expect }) => {
    // 準備
    const a = new Variables({ x: 1 });

    // 実行
    const result = mergeVariables(a, undefined);

    // 検証
    expect(result.toJSON()).toStrictEqual({ x: 1 });
  });

  test("b がキーと値のペアの配列のとき、オブジェクトに変換してマージする", ({ expect }) => {
    // 準備
    const a = new Variables({ x: 1 });
    const b = [
      ["y", 2],
      ["z", 3],
    ] as const;

    // 実行
    const result = mergeVariables(a, b);

    // 検証
    expect(result.toJSON()).toStrictEqual({ x: 1, y: 2, z: 3 });
  });

  test("b が Map のとき、マージする", ({ expect }) => {
    // 準備
    const a = new Variables({ x: 1 });
    const b = new Map([["y", 2]]);

    // 実行
    const result = mergeVariables(a, b);

    // 検証
    expect(result.toJSON()).toStrictEqual({ x: 1, y: 2 });
  });

  test("b が Variables のとき、readonly 指定を引き継ぐ", ({ expect }) => {
    // 準備
    const a = new Variables({ x: 1 });
    const b = new Variables();
    b.setReadonly("y", 2);

    // 実行
    const result = mergeVariables(a, b);

    // 検証
    expect(result.get("y")).toBe(2);
    expect(result.isReadonly("y")).toBe(true);
  });

  test("元のオブジェクトが変更されない", ({ expect }) => {
    // 準備
    const a = new Variables({ x: 1 });
    const b = { y: 2 };

    // 実行
    const result = mergeVariables(a, b);

    // 検証
    expect(a.toJSON()).toStrictEqual({ x: 1 });
    expect(b).toStrictEqual({ y: 2 });
    expect(result).not.toBe(a);
    expect(result.toJSON()).toStrictEqual({ x: 1, y: 2 });
  });

  test("a に Record を渡せる", ({ expect }) => {
    // 実行
    const result = mergeVariables({ x: 1 }, { y: 2 });

    // 検証
    expect(result).toBeInstanceOf(Variables);
    expect(result.toJSON()).toStrictEqual({ x: 1, y: 2 });
  });

  test("b の readonly は base の readonly を上書きする", ({ expect }) => {
    // 準備
    const a = new Variables();
    a.setReadonly("y", 1);
    const b = new Variables();
    b.setReadonly("y", 2);

    // 実行
    const result = mergeVariables(a, b);

    // 検証
    expect(result.get("y")).toBe(2);
    expect(result.isReadonly("y")).toBe(true);
  });

  test("base の readonly への Record 上書きは値を置き換える", ({ expect }) => {
    // 準備
    const a = new Variables();
    a.setReadonly("y", 1);

    // 実行
    const result = mergeVariables(a, { y: 2 });

    // 検証
    expect(result.get("y")).toBe(2);
    expect(result.isReadonly("y")).toBe(true);
  });

  test("b の予約キーの readonly は引き継がない", ({ expect }) => {
    // 準備
    const a = new Variables();
    const b = new Variables();
    b.setReadonly("unikvs:action", "fake");

    // 実行
    const result = mergeVariables(a, b);

    // 検証
    expect(result.get("unikvs:action")).toBe("fake");
    expect(result.isReadonly("unikvs:action")).toBe(false);
    expect(() => result.set("unikvs:action", "set")).not.toThrow(ReadonlyVariableError);
  });
});
