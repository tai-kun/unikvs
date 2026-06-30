import { describe, test } from "vitest";

import { InvalidDirnameError, InvalidFilenameError } from "../src/errors.js";

describe("InvalidFilenameError", () => {
  test("Error クラスを継承する", ({ expect }) => {
    expect(new InvalidFilenameError({ filename: "test" })).toBeInstanceOf(Error);
  });

  test("正しいエラー名を持つ", ({ expect }) => {
    expect(new InvalidFilenameError({ filename: "test" }).name).toBe("UniKvsInvalidFilenameError");
  });

  test("メタデータにファイル名を格納する", ({ expect }) => {
    const error = new InvalidFilenameError({ filename: "foo<bar" });
    expect(error.meta.filename).toBe("foo<bar");
  });

  test("エラーメッセージにファイル名を含む", ({ expect }) => {
    const error = new InvalidFilenameError({ filename: "foo<bar" });
    expect(error.message).toContain("foo<bar");
  });
});

describe("InvalidDirnameError", () => {
  test("Error クラスを継承する", ({ expect }) => {
    expect(new InvalidDirnameError({ dirname: "test" })).toBeInstanceOf(Error);
  });

  test("正しいエラー名を持つ", ({ expect }) => {
    expect(new InvalidDirnameError({ dirname: "test" }).name).toBe("UniKvsInvalidDirnameError");
  });

  test("メタデータにディレクトリー名を格納する", ({ expect }) => {
    const error = new InvalidDirnameError({ dirname: "foo<bar" });
    expect(error.meta.dirname).toBe("foo<bar");
  });

  test("エラーメッセージにディレクトリー名を含む", ({ expect }) => {
    const error = new InvalidDirnameError({ dirname: "foo<bar" });
    expect(error.message).toContain("foo<bar");
  });
});
