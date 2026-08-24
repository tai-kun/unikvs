import { test } from "vitest";

import { ChecksumMismatchError, ChecksumRequiredError } from "../src/errors.js";
import ChecksumSha1 from "../src/sha1.js";

const TEST_DATA = Uint8Array.from(new TextEncoder().encode("test"));
const VALID_HASH = "a94a8fe5ccb19ba61c4c0873d391e987982fbbd3";
const EMPTY_HASH = "da39a3ee5e6b4b0d3255bfef95601890afd80709";
const INVALID_HASH = "0".repeat(VALID_HASH.length);

test("CHECKSUM_CONTEXT_KEY が定義されている", ({ expect }) => {
  // 検証
  expect(ChecksumSha1.CHECKSUM_CONTEXT_KEY).toBe("@unikvs/checksum:sha1");
});

test("指定した名前が name プロパティに設定される", ({ expect }) => {
  // 準備
  const checksum = new ChecksumSha1();

  // 実行と検証
  expect(checksum.name).toBe("ChecksumSha1");
});

test("期待値と一致するチェックサムを指定して encode すると、SHA-1 のハッシュで検証してデータをそのまま返す", ({
  expect,
}) => {
  // 準備
  const checksum = new ChecksumSha1();
  const context = { [ChecksumSha1.CHECKSUM_CONTEXT_KEY]: VALID_HASH };

  // 実行
  const result = checksum.encode({ context, data: TEST_DATA });

  // 検証
  expect(result).toStrictEqual(TEST_DATA);
});

test("空のデータを SHA-1 のハッシュ値で検証できる", ({ expect }) => {
  // 準備
  const checksum = new ChecksumSha1();
  const data = new Uint8Array(0);
  const context = { [ChecksumSha1.CHECKSUM_CONTEXT_KEY]: EMPTY_HASH };

  // 実行
  const result = checksum.encode({ context, data });

  // 検証
  expect(result).toStrictEqual(data);
});

test("期待値と一致しないチェックサムを指定すると、実際のハッシュ値を含む ChecksumMismatchError を投げる", ({
  expect,
}) => {
  // 準備
  const checksum = new ChecksumSha1();
  const context = { [ChecksumSha1.CHECKSUM_CONTEXT_KEY]: INVALID_HASH };

  // 実行と検証
  try {
    checksum.encode({ context, data: TEST_DATA });
    expect.unreachable();
  } catch (error) {
    expect(error).toBeInstanceOf(ChecksumMismatchError);
    expect((error as ChecksumMismatchError).meta.actual).toBe(VALID_HASH);
  }
});

test("検証が必須のときにチェックサムが指定されていなければ ChecksumRequiredError を投げる", ({
  expect,
}) => {
  // 準備
  const checksum = new ChecksumSha1({ required: true });

  // 実行と検証
  expect(() => checksum.encode({ context: {}, data: TEST_DATA })).toThrow(ChecksumRequiredError);
});
