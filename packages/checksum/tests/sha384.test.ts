import { test } from "vitest";

import { ChecksumMismatchError, ChecksumRequiredError } from "../src/errors.js";
import ChecksumSha384 from "../src/sha384.js";

const TEST_DATA = Uint8Array.from(new TextEncoder().encode("test"));
const VALID_HASH =
  "768412320f7b0aa5812fce428dc4706b3cae50e02a64caa16a782249bfe8efc4b7ef1ccb126255d196047dfedf17a0a9";
const EMPTY_HASH =
  "38b060a751ac96384cd9327eb1b1e36a21fdb71114be07434c0cc7bf63f6e1da274edebfe76f65fbd51ad2f14898b95b";
const INVALID_HASH = "0".repeat(VALID_HASH.length);

test("CHECKSUM_CONTEXT_KEY が定義されている", ({ expect }) => {
  // 検証
  expect(ChecksumSha384.CHECKSUM_CONTEXT_KEY).toBe("@unikvs/checksum:sha384");
});

test("指定した名前が name プロパティに設定される", ({ expect }) => {
  // 準備
  const checksum = new ChecksumSha384();

  // 実行と検証
  expect(checksum.name).toBe("ChecksumSha384");
});

test("期待値と一致するチェックサムを指定して encode すると、SHA-384 のハッシュで検証してデータをそのまま返す", ({
  expect,
}) => {
  // 準備
  const checksum = new ChecksumSha384();
  const context = { [ChecksumSha384.CHECKSUM_CONTEXT_KEY]: VALID_HASH };

  // 実行
  const result = checksum.encode({ context, data: TEST_DATA });

  // 検証
  expect(result).toStrictEqual(TEST_DATA);
});

test("空のデータを SHA-384 のハッシュ値で検証できる", ({ expect }) => {
  // 準備
  const checksum = new ChecksumSha384();
  const data = new Uint8Array(0);
  const context = { [ChecksumSha384.CHECKSUM_CONTEXT_KEY]: EMPTY_HASH };

  // 実行
  const result = checksum.encode({ context, data });

  // 検証
  expect(result).toStrictEqual(data);
});

test("期待値と一致しないチェックサムを指定すると、実際のハッシュ値を含む ChecksumMismatchError を投げる", ({
  expect,
}) => {
  // 準備
  const checksum = new ChecksumSha384();
  const context = { [ChecksumSha384.CHECKSUM_CONTEXT_KEY]: INVALID_HASH };

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
  const checksum = new ChecksumSha384({ required: true });

  // 実行と検証
  expect(() => checksum.encode({ context: {}, data: TEST_DATA })).toThrow(ChecksumRequiredError);
});
