import { test } from "vitest";

import { ChecksumMismatchError, ChecksumRequiredError } from "../src/errors.js";
import ChecksumSha224 from "../src/sha224.js";

const TEST_DATA = Uint8Array.from(new TextEncoder().encode("test"));
const VALID_HASH = "90a3ed9e32b2aaf4c61c410eb925426119e1a9dc53d4286ade99a809";
const EMPTY_HASH = "d14a028c2a3a2bc9476102bb288234c415a2b01f828ea62ac5b3e42f";
const INVALID_HASH = "0".repeat(VALID_HASH.length);

test("CHECKSUM_CONTEXT_KEY が定義されている", ({ expect }) => {
  // 検証
  expect(ChecksumSha224.CHECKSUM_CONTEXT_KEY).toBe("@unikvs/checksum:sha224");
});

test("指定した名前が name プロパティに設定される", ({ expect }) => {
  // 準備
  const checksum = new ChecksumSha224();

  // 実行と検証
  expect(checksum.name).toBe("ChecksumSha224");
});

test("期待値と一致するチェックサムを指定して encode すると、SHA-224 のハッシュで検証してデータをそのまま返す", ({
  expect,
}) => {
  // 準備
  const checksum = new ChecksumSha224();
  const context = { [ChecksumSha224.CHECKSUM_CONTEXT_KEY]: VALID_HASH };

  // 実行
  const result = checksum.encode({ context, data: TEST_DATA });

  // 検証
  expect(result).toStrictEqual(TEST_DATA);
});

test("空のデータを SHA-224 のハッシュ値で検証できる", ({ expect }) => {
  // 準備
  const checksum = new ChecksumSha224();
  const data = new Uint8Array(0);
  const context = { [ChecksumSha224.CHECKSUM_CONTEXT_KEY]: EMPTY_HASH };

  // 実行
  const result = checksum.encode({ context, data });

  // 検証
  expect(result).toStrictEqual(data);
});

test("期待値と一致しないチェックサムを指定すると、実際のハッシュ値を含む ChecksumMismatchError を投げる", ({
  expect,
}) => {
  // 準備
  const checksum = new ChecksumSha224();
  const context = { [ChecksumSha224.CHECKSUM_CONTEXT_KEY]: INVALID_HASH };

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
  const checksum = new ChecksumSha224({ required: true });

  // 実行と検証
  expect(() => checksum.encode({ context: {}, data: TEST_DATA })).toThrow(ChecksumRequiredError);
});
