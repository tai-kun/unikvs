import { describe, test } from "vitest";

import assertValidDirname from "../src/assert-valid-dirname.js";
import { InvalidDirnameError } from "../src/errors.js";

describe("assertValidDirname", () => {
  test("有効なディレクトリー名は何も投げない", ({ expect }) => {
    expect(() => assertValidDirname("valid-dir")).not.toThrow();
  });

  test("無効なディレクトリー名で InvalidDirnameError を投げる", ({ expect }) => {
    expect(() => assertValidDirname("")).toThrow(InvalidDirnameError);
    expect(() => assertValidDirname(".")).toThrow(InvalidDirnameError);
    expect(() => assertValidDirname("..")).toThrow(InvalidDirnameError);
    expect(() => assertValidDirname("foo<bar")).toThrow(InvalidDirnameError);
  });

  test("投げられたエラーに無効だったディレクトリー名が格納される", ({ expect }) => {
    // 実行と検証
    try {
      assertValidDirname("foo/bar");
      expect.unreachable("InvalidDirnameError が投げられるべきです");
    } catch (error: unknown) {
      // 検証
      expect(error).toBeInstanceOf(InvalidDirnameError);
      const err = error as InvalidDirnameError;
      expect(err.meta.dirname).toBe("foo/bar");
      expect(err.message).toBe("Invalid directory name: foo/bar");
    }
  });
});
