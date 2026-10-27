import { sha256 } from "@noble/hashes/sha2.js";
import type { IMiddleware } from "@unikvs/core";
import {
  createNext,
  sourceFrom,
  createDecodeContext,
  createEncodeContext,
  createDecodeStreamContext,
  createEncodeStreamContext,
} from "@unikvs/testing";
import { setGlobalConfig, deleteGlobalConfig } from "valibot";
import { test as vitest, describe } from "vite-plus/test";

import {
  type ChecksumOptions,
  Checksum,
  ChecksumSha256,
  ChecksumMismatchError,
  ChecksumRequiredError,
  ChecksumInvalidOnHashError,
  ChecksumInvalidVarNameError,
  ChecksumInvalidRequiredError,
} from "../src/index.js";

/**
 * 言語設定をテスト内でのみ変更するためのフィクスチャーです。
 * 設定した言語はテスト終了後に削除され、ほかのテストに影響しません。
 */
const test = vitest.extend<{
  setLang: (lang: string) => void;
}>({
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

type ByteEncode = IMiddleware.EncodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>;

type ByteDecode = IMiddleware.DecodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>;

type ByteEncodeStream = IMiddleware.EncodeStreamContext<
  Uint8Array<ArrayBuffer>,
  Uint8Array<ArrayBuffer>
>;

type ByteDecodeStream = IMiddleware.DecodeStreamContext<
  Uint8Array<ArrayBuffer>,
  Uint8Array<ArrayBuffer>
>;

/**
 * データを検証してそのまま返します。
 */
async function encode(
  checksum: ChecksumSha256 | InvalidVarNameChecksum,
  data: Uint8Array<ArrayBuffer>,
  values?: Record<string, unknown>,
): Promise<Uint8Array<ArrayBuffer>> {
  const c = createEncodeContext(data, "", { values });
  await checksum.encode(c as ByteEncode, createNext());

  return c.destination;
}

describe("ChecksumMismatchError", () => {
  test("meta に actual と expected を保持し、既定では英語メッセージを返す", ({ expect }) => {
    // 準備と実行：
    const error = new ChecksumMismatchError({
      actual: "aaaa",
      expected: "bbbb",
    });

    // 検証：
    expect(error).toBeInstanceOf(globalThis.Error);
    expect(error.name).toBe("UniKvsChecksumMismatchError");
    expect(error.meta).toStrictEqual({
      actual: "aaaa",
      expected: "bbbb",
    });
    expect(error.message).toBe("Expected bbbb, but got aaaa");
  });

  test("言語設定が日本語なら日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備：
    const error = new ChecksumMismatchError({
      actual: "aaaa",
      expected: "bbbb",
    });

    // 実行：
    setLang("ja");

    // 検証：
    expect(error.message).toBe("bbbb を期待しましたが、aaaa を得ました");
  });

  test("期待値の 16 進文字列が大文字のときは不一致として拒否する", async ({ expect }) => {
    // 準備：
    const checksum = new ChecksumSha256();
    const expected = ABC_DIGEST.toUpperCase();

    // 実行：
    let thrown: unknown;

    try {
      await encode(checksum, DATA, { [ChecksumSha256.CHECKSUM_VAR_NAME]: expected });
    } catch (error) {
      thrown = error;
    }

    // 検証：
    expect(thrown).toBeInstanceOf(ChecksumMismatchError);
    expect((thrown as ChecksumMismatchError).meta).toStrictEqual({
      actual: ABC_DIGEST,
      expected,
    });
  });

  test("期待値が空文字のときは不一致として拒否する", async ({ expect }) => {
    // 準備：
    const checksum = new ChecksumSha256();

    // 実行：
    let thrown: unknown;

    try {
      await encode(checksum, DATA, { [ChecksumSha256.CHECKSUM_VAR_NAME]: "" });
    } catch (error) {
      thrown = error;
    }

    // 検証：
    expect(thrown).toBeInstanceOf(ChecksumMismatchError);
    expect((thrown as ChecksumMismatchError).meta).toStrictEqual({
      actual: ABC_DIGEST,
      expected: "",
    });
  });
});

describe("ChecksumRequiredError", () => {
  test("既定では英語メッセージを返す", ({ expect }) => {
    // 実行と検証：
    const error = new ChecksumRequiredError();
    expect(error).toBeInstanceOf(globalThis.Error);
    expect(error.name).toBe("ChecksumRequiredError");
    expect(error.message).toBe("Checksum is required");
  });

  test("言語設定が日本語なら日本語メッセージを返す", ({ expect, setLang }) => {
    // 実行：
    const error = new ChecksumRequiredError();

    setLang("ja");

    // 検証：
    expect(error.message).toBe("チェックサムは必須です");
  });
});

describe("ChecksumInvalidVarNameError", () => {
  test("CHECKSUM_VAR_NAME が文字列でないサブクラスは encode で拒否する", async ({ expect }) => {
    // 準備：
    const checksum = new InvalidVarNameChecksum();

    // 実行と検証：
    await expect(encode(checksum, DATA)).rejects.toThrow(ChecksumInvalidVarNameError);
  });

  test("CHECKSUM_VAR_NAME が文字列でないサブクラスは decode で拒否する", async ({ expect }) => {
    // 準備：
    const checksum = new InvalidVarNameChecksum();

    // 実行と検証：
    const c = createDecodeContext(DATA);
    await expect(checksum.decode(c as ByteDecode, createNext())).rejects.toThrow(
      ChecksumInvalidVarNameError,
    );
  });

  test("CHECKSUM_VAR_NAME が文字列でないサブクラスは encodeStream で拒否する", async ({
    expect,
  }) => {
    // 準備：
    const checksum = new InvalidVarNameChecksum();

    // 実行と検証：
    const c = createEncodeStreamContext(sourceFrom([]));
    await expect(checksum.encodeStream(c as ByteEncodeStream, createNext())).rejects.toThrow(
      ChecksumInvalidVarNameError,
    );
  });

  test("CHECKSUM_VAR_NAME が文字列でないサブクラスは decodeStream で拒否する", async ({
    expect,
  }) => {
    // 準備：
    const checksum = new InvalidVarNameChecksum();

    // 実行と検証：
    const c = createDecodeStreamContext(sourceFrom([]));
    await expect(checksum.decodeStream(c as ByteDecodeStream, createNext())).rejects.toThrow(
      ChecksumInvalidVarNameError,
    );
  });

  test("meta.actual に無効な値を保持し、既定では英語メッセージを返す", ({ expect }) => {
    // 実行：
    const error = new ChecksumInvalidVarNameError({ actual: 42 });

    // 検証：
    expect(error.name).toBe("UniKvsChecksumInvalidVarNameError");
    expect(error.meta).toStrictEqual({ actual: 42 });
    expect(error.message).toBe("Invalid vars key: 42");
  });

  test("言語設定が日本語なら日本語メッセージを返す", ({ expect, setLang }) => {
    // 実行：
    const error = new ChecksumInvalidVarNameError({ actual: 42 });

    setLang("ja");

    // 検証：
    expect(error.message).toBe("無効な変数キー: 42");
  });
});

describe("ChecksumInvalidOnHashError", () => {
  test("meta に actual を保持し、既定では英語メッセージを返す", ({ expect }) => {
    // 実行：
    const error = new ChecksumInvalidOnHashError({ actual: "not a function" });

    // 検証：
    expect(error).toBeInstanceOf(globalThis.Error);
    expect(error.name).toBe("UniKvsChecksumInvalidOnHashError");
    expect(error.meta).toStrictEqual({ actual: "not a function" });
    expect(error.message).toBe("Invalid checksum onHash callback: 'not a function'");
  });

  test("言語設定が日本語なら日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備：
    const error = new ChecksumInvalidOnHashError({ actual: 42 });

    // 実行：
    setLang("ja");

    // 検証：
    expect(error.message).toBe("無効な checksum onHash コールバック: 42");
  });

  test("onHash 変数が関数でない場合は encode で拒否する", async ({ expect }) => {
    // 準備：
    const checksum = new ChecksumSha256();

    // 実行と検証：
    await expect(
      encode(checksum, DATA, {
        [ChecksumSha256.CHECKSUM_ON_HASH_VAR_NAME]: "not a function",
      }),
    ).rejects.toThrow(ChecksumInvalidOnHashError);
  });
});

describe("ChecksumInvalidRequiredError", () => {
  test("meta に actual を保持し、既定では英語メッセージを返す", ({ expect }) => {
    // 実行：
    const error = new ChecksumInvalidRequiredError({ actual: null });

    // 検証：
    expect(error).toBeInstanceOf(globalThis.Error);
    expect(error.name).toBe("UniKvsChecksumInvalidRequiredError");
    expect(error.meta).toStrictEqual({ actual: null });
    expect(error.message).toBe("Invalid checksum required option: null");
  });

  test("cause を保持する", ({ expect }) => {
    // 準備：
    const cause = new Error("原因");

    // 実行：
    const error = new ChecksumInvalidRequiredError({
      cause,
      actual: null,
    });

    // 検証：
    expect(error.cause).toBe(cause);
  });

  test("言語設定が日本語なら日本語メッセージを返す", ({ expect, setLang }) => {
    // 準備：
    const error = new ChecksumInvalidRequiredError({ actual: null });

    // 実行：
    setLang("ja");

    // 検証：
    expect(error.message).toBe("無効な checksum required オプション: null");
  });
});

describe("不正な required のコンストラクター", () => {
  test("無効値は ChecksumInvalidRequiredError で拒否する", ({ expect }) => {
    // 準備：
    // null は既定値に吸収されず無効値として拒否される。
    const invalidValues = [null, 1, "true", 0];

    // 実行と検証：
    for (const value of invalidValues) {
      expect(
        () => new ChecksumSha256({ required: value as unknown as ChecksumOptions["required"] }),
        String(value),
      ).toThrow(ChecksumInvalidRequiredError);
    }
  });

  test("meta.actual に指定値をそのまま保持する", ({ expect }) => {
    // 実行と検証：
    for (const value of [null, 1, "true", 0]) {
      let thrown: unknown;

      try {
        thrown = new ChecksumSha256({ required: value as unknown as ChecksumOptions["required"] });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(ChecksumInvalidRequiredError);
      expect((thrown as ChecksumInvalidRequiredError).meta).toStrictEqual({ actual: value });
    }
  });
});
