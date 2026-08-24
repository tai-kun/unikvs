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

  test("英語のエラーメッセージにファイル名を含む", ({ expect }) => {
    const error = new InvalidFilenameError({ filename: "foo<bar" });
    expect(error.message).toBe("Invalid file name: foo<bar");
  });

  test("options.cause を Error の cause に伝達する", ({ expect }) => {
    // 準備
    const cause = new Error("原因");

    // 実行
    const error = new InvalidFilenameError({ filename: "test", cause });

    // 検証
    expect(error.cause).toBe(cause);
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

  test("英語のエラーメッセージにディレクトリー名を含む", ({ expect }) => {
    const error = new InvalidDirnameError({ dirname: "foo<bar" });
    expect(error.message).toBe("Invalid directory name: foo<bar");
  });

  test("options.cause を Error の cause に伝達する", ({ expect }) => {
    // 準備
    const cause = new Error("原因");

    // 実行
    const error = new InvalidDirnameError({ dirname: "test", cause });

    // 検証
    expect(error.cause).toBe(cause);
  });
});
