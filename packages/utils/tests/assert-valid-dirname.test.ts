import { describe, test } from "vitest";

import assertValidDirname from "../src/assert-valid-dirname.js";
import { InvalidDirnameError } from "../src/errors.js";

describe("assertValidDirname", () => {
  test("有効なディレクトリー名は何も投げない", ({ expect }) => {
    expect(() => assertValidDirname("valid-dir")).not.toThrow();
  });

  test("無効なディレクトリー名で InvalidDirnameError を投げる", ({ expect }) => {
    expect(() => assertValidDirname("")).toThrow(InvalidDirnameError);
    expect(() => assertValidDirname("foo<bar")).toThrow(InvalidDirnameError);
  });

  test("エラーメッセージに無効なディレクトリー名を含む", ({ expect }) => {
    try {
      assertValidDirname("");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(InvalidDirnameError);
      const err = error as InvalidDirnameError;
      expect(err.meta.dirname).toBe("");
      expect(err.message).toContain("");
    }
  });
});
