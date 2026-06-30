import { describe, test } from "vitest";

import assertValidFilename from "../src/assert-valid-filename.js";
import { InvalidFilenameError } from "../src/errors.js";

describe("assertValidFilename", () => {
  test("有効なファイル名は何も投げない", ({ expect }) => {
    expect(() => assertValidFilename("hello.txt")).not.toThrow();
  });

  test("無効なファイル名で InvalidFilenameError を投げる", ({ expect }) => {
    expect(() => assertValidFilename("")).toThrow(InvalidFilenameError);
    expect(() => assertValidFilename("foo/bar")).toThrow(InvalidFilenameError);
    expect(() => assertValidFilename("CON")).toThrow(InvalidFilenameError);
  });

  test("エラーメッセージに無効なファイル名を含む", ({ expect }) => {
    try {
      assertValidFilename("");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(InvalidFilenameError);
      const err = error as InvalidFilenameError;
      expect(err.meta.filename).toBe("");
      expect(err.message).toContain("");
    }
  });
});
