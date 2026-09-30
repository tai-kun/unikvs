import { describe, test as vitest } from "vitest";

import { deleteGlobalConfig, setGlobalConfig } from "../../core/node_modules/valibot/dist/index.js";
import assertValidDirname from "../src/assert-valid-dirname.js";
import assertValidFilename from "../src/assert-valid-filename.js";
import { InvalidDirnameError, InvalidFilenameError } from "../src/errors.js";

/**
 * 言語設定をテスト内でのみ変更するためのフィクスチャーです。
 * テスト終了後にグローバル設定を削除し、ほかのテストに影響しません。
 */
const test = vitest.extend<{
  setLang: (lang: string) => void;
}>({
  // oxlint-disable-next-line no-empty-pattern
  async setLang({}, use) {
    await use((lang) => {
      setGlobalConfig({ lang });
    });
    deleteGlobalConfig();
  },
});

describe("i18n エラーメッセージ (server)", () => {
  test("ja を設定するとファイル名エラーが日本語になる", ({ expect, setLang }) => {
    // 準備
    const error = new InvalidFilenameError({ filename: "foo<bar" });

    // 実行
    setLang("ja");

    // 検証
    expect(error.message).toBe("無効なファイル名: foo<bar");
  });

  test("ja を設定するとディレクトリー名エラーが日本語になる", ({ expect, setLang }) => {
    // 準備
    const error = new InvalidDirnameError({ dirname: "foo/bar" });

    // 実行
    setLang("ja");

    // 検証
    expect(error.message).toBe("無効なディレクトリー名: foo/bar");
  });

  test("en に戻すと英語メッセージに戻る", ({ expect, setLang }) => {
    // 準備
    const error = new InvalidFilenameError({ filename: "foo<bar" });

    // 実行と検証
    setLang("ja");
    expect(error.message).toBe("無効なファイル名: foo<bar");

    setLang("en");
    expect(error.message).toBe("Invalid file name: foo<bar");
  });

  test("assertValidFilename が投げるエラーも日本語になる", ({ expect, setLang }) => {
    // 準備
    setLang("ja");

    // 実行と検証
    try {
      assertValidFilename("foo<bar");
      expect.unreachable("InvalidFilenameError が投げられるべきです");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidFilenameError);
      const err = error as InvalidFilenameError;
      expect(err.meta.filename).toBe("foo<bar");
      expect(err.message).toBe("無効なファイル名: foo<bar");
    }
  });

  test("assertValidDirname が投げるエラーも日本語になる", ({ expect, setLang }) => {
    // 準備
    setLang("ja");

    // 実行と検証
    try {
      assertValidDirname("foo/bar");
      expect.unreachable("InvalidDirnameError が投げられるべきです");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidDirnameError);
      const err = error as InvalidDirnameError;
      expect(err.meta.dirname).toBe("foo/bar");
      expect(err.message).toBe("無効なディレクトリー名: foo/bar");
    }
  });
});
