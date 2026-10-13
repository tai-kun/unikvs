import { describe, test } from "vitest";

import { ReadonlyVariableError } from "../src/errors.js";
import Variables, { type VariablesEntry } from "../src/variables.js";

describe("Variables - 生成", () => {
  test("空で生成できる", ({ expect }) => {
    // 準備と実行
    const vars = new Variables();

    // 検証
    expect(vars.size).toBe(0);
  });

  test("Record から生成できる", ({ expect }) => {
    // 準備と実行
    const vars = new Variables({ a: 1, b: "two" });

    // 検証
    expect(vars.get("a")).toBe(1);
    expect(vars.get("b")).toBe("two");
    expect(vars.size).toBe(2);
  });

  test("Map から生成できる", ({ expect }) => {
    // 準備と実行
    const vars = new Variables(
      new Map<string, unknown>([
        ["a", 1],
        ["b", "two"],
      ]),
    );

    // 検証
    expect(vars.get("a")).toBe(1);
    expect(vars.get("b")).toBe("two");
    expect(vars.size).toBe(2);
  });

  test("エントリー配列から生成できる", ({ expect }) => {
    // 準備と実行
    const vars = new Variables([
      ["a", 1],
      ["b", "two"],
    ]);

    // 検証
    expect(vars.get("a")).toBe(1);
    expect(vars.get("b")).toBe("two");
    expect(vars.size).toBe(2);
  });

  test("Variables から生成すると内容と readonly を引き継ぐ", ({ expect }) => {
    // 準備
    const source = new Variables();
    source.set("a", 1);
    source.setReadonly("b", 2);

    // 実行
    const vars = new Variables(source);

    // 検証
    expect(vars).not.toBe(source);
    expect(vars.get("a")).toBe(1);
    expect(vars.get("b")).toBe(2);
    expect(vars.size).toBe(2);
    expect(vars.isReadonly("a")).toBe(false);
    expect(vars.isReadonly("b")).toBe(true);
  });

  test("Variables から生成した後の変更は互いに見えない", ({ expect }) => {
    // 準備
    const source = new Variables();
    source.set("a", 1);
    const vars = new Variables(source);

    // 実行
    vars.setReadonly("b", 2);
    source.set("c", 3);

    // 検証
    expect(vars.get("a")).toBe(1);
    expect(source.has("b")).toBe(false);
    expect(source.isReadonly("b")).toBe(false);
    expect(vars.has("c")).toBe(false);
  });

  test("エントリーの Set から生成できる", ({ expect }) => {
    // 準備と実行
    const vars = new Variables(
      new Set<VariablesEntry>([
        ["a", 1],
        ["b", "two"],
      ]),
    );

    // 検証
    expect(vars.get("a")).toBe(1);
    expect(vars.get("b")).toBe("two");
    expect(vars.size).toBe(2);
  });
});

describe("Variables - 読み書き", () => {
  test("set した値を get と has で読める", ({ expect }) => {
    // 準備
    const vars = new Variables();

    // 実行
    const returned = vars.set("a", 1);

    // 検証
    expect(returned).toBe(vars);
    expect(vars.get("a")).toBe(1);
    expect(vars.has("a")).toBe(true);
    expect(vars.size).toBe(1);
  });

  test("set は値を上書きできる", ({ expect }) => {
    // 準備
    const vars = new Variables({ a: 1 });

    // 実行
    vars.set("a", 2);

    // 検証
    expect(vars.get("a")).toBe(2);
  });

  test("delete は値を削除する", ({ expect }) => {
    // 準備
    const vars = new Variables({ a: 1, b: 2 });

    // 実行と検証
    expect(vars.delete("a")).toBe(true);
    expect(vars.has("a")).toBe(false);
    expect(vars.delete("missing")).toBe(false);
  });
});

describe("Variables - readonly", () => {
  test("setReadonly で登録できる", ({ expect }) => {
    // 準備
    const vars = new Variables();

    // 実行
    const returned = vars.setReadonly("a", 1);

    // 検証
    expect(returned).toBe(vars);
    expect(vars.get("a")).toBe(1);
    expect(vars.isReadonly("a")).toBe(true);
  });

  test("setReadonly はミュータブル値を上書きして readonly 化する", ({ expect }) => {
    // 準備
    const vars = new Variables({ a: 1 });

    // 実行
    vars.setReadonly("a", 2);

    // 検証
    expect(vars.get("a")).toBe(2);
    expect(vars.isReadonly("a")).toBe(true);
  });

  test("readonly への変更は例外になる", ({ expect }) => {
    // 準備
    const vars = new Variables();
    vars.setReadonly("a", 1);

    // 実行と検証
    expect(() => vars.set("a", 2)).toThrow(ReadonlyVariableError);
    expect(() => vars.delete("a")).toThrow(ReadonlyVariableError);
    expect(() => vars.setReadonly("a", 2)).toThrow(ReadonlyVariableError);
    expect(vars.get("a")).toBe(1);
  });

  test("isReadonly は未登録で false になる", ({ expect }) => {
    // 準備と実行
    const vars = new Variables();

    // 検証
    expect(vars.isReadonly("missing")).toBe(false);
  });

  test("size と反復は readonly を含む", ({ expect }) => {
    // 準備
    const vars = new Variables();
    vars.set("a", 1);
    vars.setReadonly("b", 2);

    // 実行と検証
    expect(vars.size).toBe(2);
    expect([...vars.entries()]).toStrictEqual([
      ["a", 1],
      ["b", 2],
    ]);
    expect([...vars]).toStrictEqual([
      ["a", 1],
      ["b", 2],
    ]);
  });
});

describe("Variables - 反復と変換", () => {
  test("entries と iterator で全件を読める", ({ expect }) => {
    // 準備
    const vars = new Variables({ a: 1, b: 2 });

    // 実行と検証
    expect([...vars.entries()]).toStrictEqual([
      ["a", 1],
      ["b", 2],
    ]);
    expect([...vars]).toStrictEqual([
      ["a", 1],
      ["b", 2],
    ]);
  });

  test("toJSON はプレーンオブジェクトを返す", ({ expect }) => {
    // 準備
    const vars = new Variables({ a: 1 });

    // 実行と検証
    expect(vars.toJSON()).toStrictEqual({ a: 1 });
  });

  test("toStringTag は Variables である", ({ expect }) => {
    // 実行と検証
    expect(Object.prototype.toString.call(new Variables())).toBe("[object Variables]");
  });
});

describe("Variables - clone", () => {
  test("内容と readonly を引き継ぐ", ({ expect }) => {
    // 準備
    const vars = new Variables();
    vars.set("a", 1);
    vars.setReadonly("b", 2);

    // 実行
    const cloned = vars.clone();

    // 検証
    expect(cloned).not.toBe(vars);
    expect([...cloned]).toStrictEqual([
      ["a", 1],
      ["b", 2],
    ]);
    expect(cloned.isReadonly("b")).toBe(true);
    expect(cloned.isReadonly("a")).toBe(false);
  });

  test("複製後の変更は互いに見えない", ({ expect }) => {
    // 準備
    const vars = new Variables({ a: 1 });
    const cloned = vars.clone();

    // 実行
    cloned.set("b", 2);
    vars.set("c", 3);

    // 検証
    expect(vars.has("b")).toBe(false);
    expect(cloned.has("c")).toBe(false);
  });

  test("値は複写せず共有する", ({ expect }) => {
    // 準備
    const shared = { count: 1 };
    const vars = new Variables();
    vars.set("obj", shared);

    // 実行
    const cloned = vars.clone();

    // 検証
    expect(cloned.get("obj")).toBe(shared);
  });

  test("Record で上書きできる", ({ expect }) => {
    // 準備
    const vars = new Variables();
    vars.set("a", 1);
    vars.setReadonly("b", 2);

    // 実行
    const cloned = vars.clone({ b: 3, c: 4 });

    // 検証
    expect(cloned.get("a")).toBe(1);
    expect(cloned.get("b")).toBe(3);
    expect(cloned.isReadonly("b")).toBe(true);
    expect(cloned.get("c")).toBe(4);
    expect(cloned.isReadonly("c")).toBe(false);
    expect(vars.get("b")).toBe(2);
    expect(vars.has("c")).toBe(false);
  });

  test("Map で上書きできる", ({ expect }) => {
    // 準備
    const vars = new Variables();
    vars.setReadonly("a", 1);

    // 実行
    const cloned = vars.clone(new Map([["a", 2]]));

    // 検証
    expect(cloned.get("a")).toBe(2);
    expect(cloned.isReadonly("a")).toBe(true);
    expect(vars.get("a")).toBe(1);
  });

  test("エントリー配列で上書きできる", ({ expect }) => {
    // 準備
    const vars = new Variables();
    vars.setReadonly("a", 1);

    // 実行
    const cloned = vars.clone([["a", 2]]);

    // 検証
    expect(cloned.get("a")).toBe(2);
    expect(cloned.isReadonly("a")).toBe(true);
    expect(vars.get("a")).toBe(1);
  });

  test("Variables で上書きすると値と readonly を引き継ぐ", ({ expect }) => {
    // 準備
    const vars = new Variables({ x: 1 });
    const overrides = new Variables();
    overrides.set("y", 2);
    overrides.setReadonly("z", 3);

    // 実行
    const cloned = vars.clone(overrides);

    // 検証
    expect(cloned.toJSON()).toStrictEqual({ x: 1, y: 2, z: 3 });
    expect(cloned.isReadonly("y")).toBe(false);
    expect(cloned.isReadonly("z")).toBe(true);
    expect(overrides.toJSON()).toStrictEqual({ y: 2, z: 3 });
  });

  test("Variables の上書きは base の readonly 値を置き換えて readonly を保つ", ({ expect }) => {
    // 準備
    const vars = new Variables();
    vars.setReadonly("y", 1);
    const overrides = new Variables();
    overrides.setReadonly("y", 2);

    // 実行
    const cloned = vars.clone(overrides);

    // 検証
    expect(cloned.get("y")).toBe(2);
    expect(cloned.isReadonly("y")).toBe(true);
    expect(vars.get("y")).toBe(1);
  });
});
