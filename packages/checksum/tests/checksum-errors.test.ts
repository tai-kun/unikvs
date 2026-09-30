import { sha256 } from "@noble/hashes/sha2.js";
import { describe, test as vitest } from "vitest";

import { deleteGlobalConfig, setGlobalConfig } from "../../core/node_modules/valibot/dist/index.js";
import {
  Checksum,
  ChecksumInvalidVarNameError,
  ChecksumMismatchError,
  ChecksumRequiredError,
  ChecksumSha256,
} from "../src/index.js";

/**
 * 言語設定をテスト内でのみ変更するためのフィクスチャーです。
 * 設定した言語はテスト終了後に削除され、ほかのテストに影響しません。
 *
 * valibot は checksum の直接依存ではないため、@unikvs/core が使う実体を
 * 明示的に参照しています。ブラウザーでは読み込まれるモジュール実体が
 * 分かれるため、日本語メッセージの検証はサーバーでのみ行います。
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

  test.skipIf(__CLIENT__)("言語設定が日本語なら日本語メッセージを返す", ({ expect, setLang }) => {
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
    const vars = { [ChecksumSha256.CHECKSUM_VAR_NAME]: expected };

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
    const vars = { [ChecksumSha256.CHECKSUM_VAR_NAME]: "" };

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

  test.skipIf(__CLIENT__)("言語設定が日本語なら日本語メッセージを返す", ({ expect, setLang }) => {
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
    expect(() => checksum.encode({ vars: {}, data: DATA })).toThrow(ChecksumInvalidVarNameError);
  });

  test("CHECKSUM_VAR_NAME が文字列でないサブクラスは decode で拒否する", ({ expect }) => {
    // 準備
    const checksum = new InvalidVarNameChecksum();

    // 実行と検証
    expect(() => checksum.decode({ vars: {}, data: DATA })).toThrow(ChecksumInvalidVarNameError);
  });

  test("CHECKSUM_VAR_NAME が文字列でないサブクラスは getEncodable で拒否する", ({ expect }) => {
    // 準備
    const checksum = new InvalidVarNameChecksum();

    // 実行と検証
    expect(() => checksum.getEncodable({ vars: {} })).toThrow(ChecksumInvalidVarNameError);
  });

  test("CHECKSUM_VAR_NAME が文字列でないサブクラスは getDecodable で拒否する", ({ expect }) => {
    // 準備
    const checksum = new InvalidVarNameChecksum();

    // 実行と検証
    expect(() => checksum.getDecodable({ vars: {} })).toThrow(ChecksumInvalidVarNameError);
  });

  test("meta.actual に無効な値を保持し、既定では英語メッセージを返す", ({ expect }) => {
    // 実行
    const error = new ChecksumInvalidVarNameError({ actual: 42 });

    // 検証
    expect(error.name).toBe("UniKvsChecksumInvalidVarNameError");
    expect(error.meta).toStrictEqual({ actual: 42 });
    expect(error.message).toBe("Invalid vars key: 42");
  });

  test.skipIf(__CLIENT__)("言語設定が日本語なら日本語メッセージを返す", ({ expect, setLang }) => {
    // 実行
    const error = new ChecksumInvalidVarNameError({ actual: 42 });
    setLang("ja");

    // 検証
    expect(error.message).toBe("無効な変数キー: 42");
  });
});
