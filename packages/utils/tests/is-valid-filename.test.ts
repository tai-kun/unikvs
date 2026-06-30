import { describe, test } from "vitest";

import isValidFilename from "../src/is-valid-filename.js";

describe("isValidFilename", () => {
  test("有効なファイル名を受け入れる", ({ expect }) => {
    expect(isValidFilename("hello.txt")).toBe(true);
    expect(isValidFilename("valid-name")).toBe(true);
    expect(isValidFilename("a")).toBe(true);
    expect(isValidFilename("123")).toBe(true);
    expect(isValidFilename("foo.bar.baz")).toBe(true);
  });

  test("空文字列、カレントディレクトリー、親ディレクトリーを拒否する", ({ expect }) => {
    expect(isValidFilename("")).toBe(false);
    expect(isValidFilename(".")).toBe(false);
    expect(isValidFilename("..")).toBe(false);
  });

  test("予約文字を含むファイル名を拒否する", ({ expect }) => {
    expect(isValidFilename("foo/bar")).toBe(false);
    expect(isValidFilename("foo<bar")).toBe(false);
    expect(isValidFilename("foo>bar")).toBe(false);
    expect(isValidFilename('foo"bar')).toBe(false);
    expect(isValidFilename("foo\\bar")).toBe(false);
    expect(isValidFilename("foo|bar")).toBe(false);
    expect(isValidFilename("foo\0bar")).toBe(false);
  });

  test("コロンを含むファイル名を拒否する", ({ expect }) => {
    expect(isValidFilename("foo:bar")).toBe(false);
  });

  test("Windowsの予約名を拒否する", ({ expect }) => {
    expect(isValidFilename("CON")).toBe(false);
    expect(isValidFilename("PRN")).toBe(false);
    expect(isValidFilename("AUX")).toBe(false);
    expect(isValidFilename("NUL")).toBe(false);
    expect(isValidFilename("COM1")).toBe(false);
    expect(isValidFilename("COM9")).toBe(false);
    expect(isValidFilename("LPT1")).toBe(false);
    expect(isValidFilename("LPT9")).toBe(false);
  });

  test("255バイトを超えるファイル名を拒否する", ({ expect }) => {
    expect(isValidFilename("a".repeat(255))).toBe(true);
    expect(isValidFilename("a".repeat(256))).toBe(false);
  });

  test("マルチバイト文字を含む長いファイル名を正しく検証する", ({ expect }) => {
    expect(isValidFilename("あ".repeat(85))).toBe(true);
    expect(isValidFilename("あ".repeat(86))).toBe(false);
  });

  test("NFD正規化されていない文字を含むファイル名を拒否する", ({ expect }) => {
    expect(isValidFilename("\u00e9")).toBe(false);
  });

  test("NFC正規化されていない文字を含むファイル名を拒否する", ({ expect }) => {
    expect(isValidFilename("e\u0301")).toBe(false);
  });

  test("制御文字を含むファイル名を拒否する", ({ expect }) => {
    expect(isValidFilename("foo\u0001bar")).toBe(false);
    expect(isValidFilename("foo\u001Fbar")).toBe(false);
  });
});
