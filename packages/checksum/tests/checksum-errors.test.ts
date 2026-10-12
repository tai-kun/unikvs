import { sha256 } from "@noble/hashes/sha2.js";
import { Variables } from "@unikvs/core";
import { deleteGlobalConfig, setGlobalConfig } from "valibot";
import { describe, test as vitest } from "vitest";

import {
  Checksum,
  ChecksumInvalidRequiredError,
  ChecksumInvalidVarNameError,
  ChecksumMismatchError,
  ChecksumRequiredError,
  ChecksumSha256,
  type ChecksumOptions,
} from "../src/index.js";

/**
 * 言語設定をテスト内でのみ変更するためのフィクスチャーです。
 * 設定した言語はテスト終了後に削除され、ほかのテストに影響しません。
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

/**
 * CHECKSUM_VAR_NAME が文字列でない状態を再現するサブクラスです。
 * ChecksumInvalidVarNameError の検証のために使用します。
 */
class InvalidVarNameChecksum extends Checksum {
  public static override CHECKSUM_VAR_NAME: string = 42 as unknown as string;

  public constructor() {
    super("InvalidVarNameChecksum", sha256);
  }
}

const DATA = Uint8Array.from(new TextEncoder().encode("abc"));
const ABC_DIGEST = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

describe("ChecksumMismatchError", () => {
  test("meta に actual と expected を保持し、既定では英語メッセージを返す", ({ expect }) => {
    // 準備と実行
    const error = new ChecksumMismatchError({ actual: "aaaa", expected: "bbbb" });

    // 検証
    expect(error).toBeInstanceOf(globalThis.Error);
    expect(error.name).toBe("UniKvsChecksumMismatchError");
    expect(error.meta).toStrictEqual({ actual: "aaaa", expected: "bbbb" });
    expect(error.message).toBe("Expected bbbb, but got aaaa");
  });

  test("言語設定が日本語なら日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備
    const error = new ChecksumMismatchError({ actual: "aaaa", expected: "bbbb" });

    // 実行
    setLang("ja");

    // 検証
    expect(error.message).toBe("bbbb を期待しましたが、aaaa を得ました");
  });

  test("期待値の 16 進文字列が大文字のときは不一致として拒否する", ({ expect }) => {
    // 準備
    const checksum = new ChecksumSha256();
    const expected = ABC_DIGEST.toUpperCase();
    const vars = new Variables({ [ChecksumSha256.CHECKSUM_VAR_NAME]: expected });

    // 実行
    let thrown: unknown;
    try {
      checksum.encode({ vars, data: DATA });
    } catch (error) {
      thrown = error;
    }

    // 検証
    expect(thrown).toBeInstanceOf(ChecksumMismatchError);
    expect((thrown as ChecksumMismatchError).meta).toStrictEqual({
      actual: ABC_DIGEST,
      expected,
    });
  });

  test("期待値が空文字のときは不一致として拒否する", ({ expect }) => {
    // 準備
    const checksum = new ChecksumSha256();
    const vars = new Variables({ [ChecksumSha256.CHECKSUM_VAR_NAME]: "" });

    // 実行
    let thrown: unknown;
    try {
      checksum.encode({ vars, data: DATA });
    } catch (error) {
      thrown = error;
    }

    // 検証
    expect(thrown).toBeInstanceOf(ChecksumMismatchError);
    expect((thrown as ChecksumMismatchError).meta).toStrictEqual({
      actual: ABC_DIGEST,
      expected: "",
    });
  });
});

describe("ChecksumRequiredError", () => {
  test("既定では英語メッセージを返す", ({ expect }) => {
    // 実行と検証
    const error = new ChecksumRequiredError();

    expect(error).toBeInstanceOf(globalThis.Error);
    expect(error.name).toBe("ChecksumRequiredError");
    expect(error.message).toBe("Checksum is required");
  });

  test("言語設定が日本語なら日本語メッセージを返す", ({ expect, setLang }) => {
    // 実行
    const error = new ChecksumRequiredError();
    setLang("ja");

    // 検証
    expect(error.message).toBe("チェックサムは必須です");
  });
});

describe("ChecksumInvalidVarNameError", () => {
  test("CHECKSUM_VAR_NAME が文字列でないサブクラスは encode で拒否する", ({ expect }) => {
    // 準備
    const checksum = new InvalidVarNameChecksum();

    // 実行と検証
    expect(() => checksum.encode({ vars: new Variables({}), data: DATA })).toThrow(
      ChecksumInvalidVarNameError,
    );
  });

  test("CHECKSUM_VAR_NAME が文字列でないサブクラスは decode で拒否する", ({ expect }) => {
    // 準備
    const checksum = new InvalidVarNameChecksum();

    // 実行と検証
    expect(() => checksum.decode({ vars: new Variables({}), data: DATA })).toThrow(
      ChecksumInvalidVarNameError,
    );
  });

  test("CHECKSUM_VAR_NAME が文字列でないサブクラスは getEncodable で拒否する", ({ expect }) => {
    // 準備
    const checksum = new InvalidVarNameChecksum();

    // 実行と検証
    expect(() => checksum.getEncodable({ vars: new Variables({}) })).toThrow(
      ChecksumInvalidVarNameError,
    );
  });

  test("CHECKSUM_VAR_NAME が文字列でないサブクラスは getDecodable で拒否する", ({ expect }) => {
    // 準備
    const checksum = new InvalidVarNameChecksum();

    // 実行と検証
    expect(() => checksum.getDecodable({ vars: new Variables({}) })).toThrow(
      ChecksumInvalidVarNameError,
    );
  });

  test("meta.actual に無効な値を保持し、既定では英語メッセージを返す", ({ expect }) => {
    // 実行
    const error = new ChecksumInvalidVarNameError({ actual: 42 });

    // 検証
    expect(error.name).toBe("UniKvsChecksumInvalidVarNameError");
    expect(error.meta).toStrictEqual({ actual: 42 });
    expect(error.message).toBe("Invalid vars key: 42");
  });

  test("言語設定が日本語なら日本語メッセージを返す", ({ expect, setLang }) => {
    // 実行
    const error = new ChecksumInvalidVarNameError({ actual: 42 });
    setLang("ja");

    // 検証
    expect(error.message).toBe("無効な変数キー: 42");
  });
});

describe("ChecksumInvalidRequiredError", () => {
  test("meta に actual を保持し、既定では英語メッセージを返す", ({ expect }) => {
    // 実行
    const error = new ChecksumInvalidRequiredError({ actual: null });

    // 検証
    expect(error).toBeInstanceOf(globalThis.Error);
    expect(error.name).toBe("UniKvsChecksumInvalidRequiredError");
    expect(error.meta).toStrictEqual({ actual: null });
    expect(error.message).toBe("Invalid checksum required option: null");
  });

  test("cause を保持する", ({ expect }) => {
    // 準備
    const cause = new Error("原因");

    // 実行
    const error = new ChecksumInvalidRequiredError({ actual: null, cause });

    // 検証
    expect(error.cause).toBe(cause);
  });

  test("言語設定が日本語なら日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備
    const error = new ChecksumInvalidRequiredError({ actual: null });

    // 実行
    setLang("ja");

    // 検証
    expect(error.message).toBe("無効な checksum required オプション: null");
  });
});

describe("不正な required のコンストラクター", () => {
  test("無効値は ChecksumInvalidRequiredError で拒否する", ({ expect }) => {
    // 準備
    // null は既定値に吸収されず無効値として拒否される。
    const invalidValues = [null, 1, "true", 0];

    // 実行と検証
    for (const value of invalidValues) {
      expect(
        () => new ChecksumSha256({ required: value as unknown as ChecksumOptions["required"] }),
        `${String(value)}`,
      ).toThrow(ChecksumInvalidRequiredError);
    }
  });

  test("meta.actual に指定値をそのまま保持する", ({ expect }) => {
    // 実行と検証
    for (const value of [null, 1, "true", 0]) {
      let thrown: unknown;

      try {
        new ChecksumSha256({ required: value as unknown as ChecksumOptions["required"] });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(ChecksumInvalidRequiredError);
      expect((thrown as ChecksumInvalidRequiredError).meta).toStrictEqual({ actual: value });
    }
  });
});
