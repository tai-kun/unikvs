import { describe, test } from "vitest";

import isValidDirname from "../src/is-valid-dirname.js";

describe("isValidDirname", () => {
  test("有効なディレクトリー名を受け入れる", ({ expect }) => {
    expect(isValidDirname("valid-dir")).toBe(true);
    expect(isValidDirname("a")).toBe(true);
    expect(isValidDirname("123")).toBe(true);
  });

  test("空文字列、カレントディレクトリー、親ディレクトリーを拒否する", ({ expect }) => {
    expect(isValidDirname("")).toBe(false);
    expect(isValidDirname(".")).toBe(false);
    expect(isValidDirname("..")).toBe(false);
  });

  test("予約文字を含むディレクトリー名を拒否する", ({ expect }) => {
    expect(isValidDirname("foo/bar")).toBe(false);
    expect(isValidDirname("foo<bar")).toBe(false);
  });

  test("Windowsの予約名を拒否する", ({ expect }) => {
    expect(isValidDirname("CON")).toBe(false);
    expect(isValidDirname("LPT1")).toBe(false);
  });
});
