import { test } from "vitest";

import { ChecksumMismatchError, ChecksumRequiredError } from "../src/errors.js";
import ChecksumSha512 from "../src/sha512.js";

const TEST_DATA = Uint8Array.from(new TextEncoder().encode("test"));
const VALID_HASH =
  "ee26b0dd4af7e749aa1a8ee3c10ae9923f618980772e473f8819a5d4940e0db27ac185f8a0e1d5f84f88bc887fd67b143732c304cc5fa9ad8e6f57f50028a8ff";
const EMPTY_HASH =
  "cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e";
const INVALID_HASH = "0".repeat(VALID_HASH.length);

test("CHECKSUM_CONTEXT_KEY が定義されている", ({ expect }) => {
  // 検証
  expect(ChecksumSha512.CHECKSUM_CONTEXT_KEY).toBe("@unikvs/checksum:sha512");
});

test("指定した名前が name プロパティに設定される", ({ expect }) => {
  // 準備
  const checksum = new ChecksumSha512();

  // 実行と検証
  expect(checksum.name).toBe("ChecksumSha512");
});

test("期待値と一致するチェックサムを指定して encode すると、SHA-512 のハッシュで検証してデータをそのまま返す", ({
  expect,
}) => {
  // 準備
  const checksum = new ChecksumSha512();
  const context = { [ChecksumSha512.CHECKSUM_CONTEXT_KEY]: VALID_HASH };

  // 実行
  const result = checksum.encode({ context, data: TEST_DATA });

  // 検証
  expect(result).toStrictEqual(TEST_DATA);
});

test("空のデータを SHA-512 のハッシュ値で検証できる", ({ expect }) => {
  // 準備
  const checksum = new ChecksumSha512();
  const data = new Uint8Array(0);
  const context = { [ChecksumSha512.CHECKSUM_CONTEXT_KEY]: EMPTY_HASH };

  // 実行
  const result = checksum.encode({ context, data });

  // 検証
  expect(result).toStrictEqual(data);
});

test("期待値と一致しないチェックサムを指定すると、実際のハッシュ値を含む ChecksumMismatchError を投げる", ({
  expect,
}) => {
  // 準備
  const checksum = new ChecksumSha512();
  const context = { [ChecksumSha512.CHECKSUM_CONTEXT_KEY]: INVALID_HASH };

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
  const checksum = new ChecksumSha512({ required: true });

  // 実行と検証
  expect(() => checksum.encode({ context: {}, data: TEST_DATA })).toThrow(ChecksumRequiredError);
});
