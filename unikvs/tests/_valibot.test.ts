import { test, describe } from "vite-plus/test";

import * as v from "../src/_valibot.js";
import { InvalidInputError, InvalidOutputError } from "../src/errors.js";

describe("parseInput", () => {
  test("有効な入力のとき、パースされた値を返す", ({ expect }) => {
    // 準備：
    const schema = v.string();

    // 実行：
    const result = v.parseInput(schema, "hello");

    // 検証：
    expect(result).toBe("hello");
  });

  test("無効な入力のとき、InvalidInputError を投げる", ({ expect }) => {
    // 準備：
    const schema = v.number();

    // 実行と検証：
    expect(() => v.parseInput(schema, "not-a-number")).toThrow(InvalidInputError);
  });

  test("エラーコンストラクターを上書きできる", ({ expect }) => {
    // 準備：
    const schema = v.string();

    /**
     * コンストラクター引数の value をメッセージに含めるカスタムエラーです。
     * parseInput が差し替えられたエラーコンストラクターを呼び出すことを検証するために使用します。
     */
    class CustomError extends Error {
      public constructor(args: any) {
        super(`Custom: ${args.value}`);
      }
    }

    // 実行と検証：
    expect(() => v.parseInput(schema, 42, CustomError as any)).toThrow("Custom: 42");
  });

  test("issues が空でないエラー詳細を含む", ({ expect }) => {
    // 準備：
    const schema = v.object({
      age: v.number(),
      name: v.string(),
    });

    // 実行 : parseInput は同期的に例外を投げるため、try/catch で拒否理由を回収する。
    let error: InvalidInputError | undefined;

    try {
      v.parseInput(schema, {
        age: "twenty",
        name: "Alice",
      });
    } catch (ex) {
      error = ex as InvalidInputError;
    }

    // 検証：
    expect(error).toBeInstanceOf(InvalidInputError);
    expect((error as InvalidInputError).meta.issues.length).toBeGreaterThan(0);
  });
});

describe("parseOutput", () => {
  test("有効な出力のとき、パースされた値を返す", ({ expect }) => {
    // 準備：
    const schema = v.string();

    // 実行：
    const result = v.parseOutput(schema, "hello");

    // 検証：
    expect(result).toBe("hello");
  });

  test("無効な出力のとき、InvalidOutputError を投げる", ({ expect }) => {
    // 準備：
    const schema = v.number();

    // 実行と検証：
    expect(() => v.parseOutput(schema, "not-a-number")).toThrow(InvalidOutputError);
  });

  test("エラーコンストラクターを上書きできる", ({ expect }) => {
    // 準備：
    const schema = v.string();

    /**
     * コンストラクター引数の value をメッセージに含めるカスタムエラーです。
     * parseOutput が差し替えられたエラーコンストラクターを呼び出すことを検証するために使用します。
     */
    class CustomError extends Error {
      public constructor(args: any) {
        super(`Custom: ${args.value}`);
      }
    }

    // 実行と検証：
    expect(() => v.parseOutput(schema, 42, CustomError as any)).toThrow("Custom: 42");
  });
});
