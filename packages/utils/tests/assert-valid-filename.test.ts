import { describe, test } from "vitest";

import assertValidFilename from "../src/assert-valid-filename.js";
import { InvalidFilenameError } from "../src/errors.js";

describe("assertValidFilename", () => {
  test("有効なファイル名は何も投げない", ({ expect }) => {
    expect(() => assertValidFilename("hello.txt")).not.toThrow();
  });

  test("無効なファイル名で InvalidFilenameError を投げる", ({ expect }) => {
    expect(() => assertValidFilename("")).toThrow(InvalidFilenameError);
    expect(() => assertValidFilename(".")).toThrow(InvalidFilenameError);
    expect(() => assertValidFilename("..")).toThrow(InvalidFilenameError);
    expect(() => assertValidFilename("foo/bar")).toThrow(InvalidFilenameError);
    expect(() => assertValidFilename("CON")).toThrow(InvalidFilenameError);
  });

  test("投げられたエラーに無効だったファイル名が格納される", ({ expect }) => {
    // 実行と検証
    try {
      assertValidFilename("foo<bar");
      expect.unreachable("InvalidFilenameError が投げられるべきです");
    } catch (error: unknown) {
      // 検証
      expect(error).toBeInstanceOf(InvalidFilenameError);
      const err = error as InvalidFilenameError;
      expect(err.meta.filename).toBe("foo<bar");
      expect(err.message).toBe("Invalid file name: foo<bar");
    }
  });
});
