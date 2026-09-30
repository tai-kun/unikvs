import { describe, test } from "vitest";

import isValidFilename from "../src/is-valid-filename.js";

describe("isValidFilename", () => {
  describe("Windows の予約名", () => {
    test("予約名そのものを拒否する", ({ expect }) => {
      // 実行と検証
      for (const name of ["CON", "PRN", "AUX", "NUL", "COM1", "COM9", "LPT1", "LPT9"]) {
        expect(isValidFilename(name), name).toBe(false);
      }
    });

    test("大文字小文字にかかわらず予約名を拒否する", ({ expect }) => {
      // 実行と検証
      for (const name of ["con", "Con", "pRn", "aux", "nUl", "com5", "lPt7"]) {
        expect(isValidFilename(name), name).toBe(false);
      }
    });

    test("拡張子や末尾の空白が付いた予約名も拒否する", ({ expect }) => {
      // 実行と検証
      for (const name of ["CON.txt", "aux.c", "COM1.log", "NUL.tar.gz", "lpt1.", "nul "]) {
        expect(isValidFilename(name), name).toBe(false);
      }
    });

    test("予約名に似ているだけの名前は受け入れる", ({ expect }) => {
      // 実行と検証
      for (const name of ["console", "COM10", "LPT10", "null", "auxiliary", "CONtext.txt"]) {
        expect(isValidFilename(name), name).toBe(true);
      }
    });
  });

  describe("先頭と末尾の文字", () => {
    test("末尾のドットを拒否する", ({ expect }) => {
      // 実行と検証
      for (const name of ["foo.", "foo..", "a.b.", ".txt."]) {
        expect(isValidFilename(name), name).toBe(false);
      }
    });

    test("末尾の空白を拒否する", ({ expect }) => {
      // 実行と検証
      for (const name of ["foo ", "foo  ", "foo. ", "foo\t"]) {
        expect(isValidFilename(name), name).toBe(false);
      }
    });

    test("先頭のドットや空白は受け入れる", ({ expect }) => {
      // 実行と検証
      for (const name of [".hidden", ".gitignore", "..foo", " foo"]) {
        expect(isValidFilename(name), name).toBe(true);
      }
    });

    test("名前に含まれるドットや空白は受け入れる", ({ expect }) => {
      // 実行と検証
      for (const name of ["foo.bar.baz", "foo bar.txt", "foo .txt", "foo. bar"]) {
        expect(isValidFilename(name), name).toBe(true);
      }
    });
  });

  describe("パス区切り", () => {
    test("スラッシュとバックスラッシュを拒否する", ({ expect }) => {
      // 実行と検証
      for (const name of ["/", "\\", "foo/bar", "foo\\bar", "../secret", "..\\secret", "a/b/c"]) {
        expect(isValidFilename(name), name).toBe(false);
      }
    });
  });

  describe("制御文字", () => {
    test("null バイトを拒否する", ({ expect }) => {
      // 実行と検証
      for (const name of ["\u0000", "a\u0000b"]) {
        expect(isValidFilename(name), name).toBe(false);
      }
    });

    test("C0 制御文字を拒否する", ({ expect }) => {
      // 実行と検証
      for (const name of ["\u0001", "\u001F", "a\tb", "a\nb", "a\rb"]) {
        expect(isValidFilename(name), name).toBe(false);
      }
    });
  });

  describe("Unicode", () => {
    test("絵文字を含むファイル名を受け入れる", ({ expect }) => {
      // 実行と検証
      for (const name of ["😀", "a😀b", "👨‍👩‍👧", "🚀.txt"]) {
        expect(isValidFilename(name), name).toBe(true);
      }
    });

    test("NFC 形式の合成文字を受け入れる", ({ expect }) => {
      // 実行と検証
      for (const name of ["café", "\u00e9", "が", "日本語", "한국어"]) {
        expect(isValidFilename(name), name).toBe(true);
      }
    });

    test("NFD 形式の分解文字を拒否する", ({ expect }) => {
      // 実行と検証
      for (const name of ["e\u0301", "か\u3099", "が".normalize("NFD")]) {
        expect(isValidFilename(name), name).toBe(false);
      }
    });

    test("孤立サロゲートを拒否する", ({ expect }) => {
      // 実行と検証
      for (const name of ["\uD800", "\uDC00", "a\uD800b"]) {
        expect(isValidFilename(name), name).toBe(false);
      }
    });
  });

  describe("長さ", () => {
    test("UTF-8 エンコード後のバイト数で 255 バイトまで受け入れる", ({ expect }) => {
      // 実行と検証
      expect(isValidFilename("a".repeat(255))).toBe(true);
      expect(isValidFilename("a".repeat(256))).toBe(false);
      expect(isValidFilename("あ".repeat(85))).toBe(true);
      expect(isValidFilename("あ".repeat(86))).toBe(false);
      expect(isValidFilename("😀".repeat(63))).toBe(true);
      expect(isValidFilename("😀".repeat(64))).toBe(false);
      expect(isValidFilename(`${"あ".repeat(84)}abc`)).toBe(true);
    });
  });
});
