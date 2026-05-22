import { test, describe } from "vitest";

import mergeContext from "../src/_merge-context.js";

describe("オブジェクト同士を結合する場合", () => {
  test("基本的なオブジェクトが結合され、新しいオブジェクトが返されること", ({ expect }) => {
    // Arrange
    const a = { env: "prod" };
    const b = { region: "jp" };

    // Act
    const result = mergeContext(a, b);

    // Assert
    expect(result).toStrictEqual({ env: "prod", region: "jp" });
  });

  test("プロパティーのキーが重複しているとき、引数 b の値で上書きされること", ({ expect }) => {
    // Arrange
    const a = { env: "dev", timeout: 3000 };
    const b = { timeout: 5000 };

    // Act
    const result = mergeContext(a, b);

    // Assert
    expect(result).toStrictEqual({ env: "dev", timeout: 5000 });
  });
});

describe("引数 b が undefined の場合", () => {
  test("引数 a のオブジェクトがそのまま複製されて返されること", ({ expect }) => {
    // Arrange
    const a = { userId: "123" };

    // Act
    const result = mergeContext(a, undefined);

    // Assert
    expect(result).not.toBe(a);
    expect(result).toStrictEqual({ userId: "123" });
  });
});

describe("引数 b が配列（キーと値のペア）の場合", () => {
  test("配列がオブジェクトに変換され、正しく結合されること", ({ expect }) => {
    // Arrange
    const a = { role: "guest" };
    const b: [string, any][] = [
      ["role", "admin"],
      ["team", "A"],
    ];

    // Act
    const result = mergeContext(a, b);

    // Assert
    expect(result).toStrictEqual({ role: "admin", team: "A" });
  });

  test("配列内に重複するキーが存在するとき、後着優先で変換されること", ({ expect }) => {
    // Arrange
    const a = { debug: false };
    const b: [string, any][] = [
      ["debug", true],
      ["debug", false],
    ];

    // Act
    const result = mergeContext(a, b);

    // Assert
    expect(result).toStrictEqual({ debug: false });
  });

  test("配列が空配列のとき、引数 a の内容がそのまま維持されること", ({ expect }) => {
    // Arrange
    const a = { mode: "test" };
    const b: [string, any][] = [];

    // Act
    const result = mergeContext(a, b);

    // Assert
    expect(result).not.toBe(a);
    expect(result).toStrictEqual({ mode: "test" });
  });
});

describe("不変性と参照の検証を行う場合", () => {
  test("戻り値のオブジェクトが新しく生成され、引数 a および b の参照と異なること", ({ expect }) => {
    // Arrange
    const a = { flag: true };
    const b = { unique: 1 };

    // Act
    const result = mergeContext(a, b);

    // Assert
    expect(result).not.toBe(a);
    expect(result).not.toBe(b);
  });
});

describe("空オブジェクトを扱う場合", () => {
  test("引数 a が空オブジェクトのとき、引数 b の内容が返されること", ({ expect }) => {
    // Arrange
    const a = {};
    const b = { traceId: "abc" };

    // Act
    const result = mergeContext(a, b);

    // Assert
    expect(result).not.toBe(b);
    expect(result).toStrictEqual({ traceId: "abc" });
  });

  test("引数 b が空オブジェクトのとき、引数 a の内容が返されること", ({ expect }) => {
    // Arrange
    const a = { traceId: "abc" };
    const b = {};

    // Act
    const result = mergeContext(a, b);

    // Assert
    expect(result).not.toBe(a);
    expect(result).toStrictEqual({ traceId: "abc" });
  });

  test("両方の引数が空オブジェクトのとき、空オブジェクトが返されること", ({ expect }) => {
    // Arrange
    const a = {};
    const b = {};

    // Act
    const result = mergeContext(a, b);

    // Assert
    expect(result).not.toBe(a);
    expect(result).not.toBe(b);
    expect(result).toStrictEqual({});
  });
});
