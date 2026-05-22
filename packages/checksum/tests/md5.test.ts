import { test } from "vitest";

import { ChecksumRequiredError } from "../src/errors.js";
import ChecksumMd5 from "../src/md5.js";

const TEST_DATA = new TextEncoder().encode("test");
const VALID_HASH = "098f6bcd4621d373cade4e832627b4f6";

test("CHECKSUM_CONTEXT_KEY が定義されている", ({ expect }) => {
  // Assert
  expect(ChecksumMd5.CHECKSUM_CONTEXT_KEY).toBe("@unikvs/checksum:md5");
});

test("インスタンスを作成したとき、指定した名前が name プロパティに正しく設定される", ({
  expect,
}) => {
  // Arrange
  const checksum = new ChecksumMd5();

  // Assert
  expect(checksum.name).toBe("ChecksumMd5");
});

test("context に正確なハッシュ値が含まれるとき、encode 処理で例外が発生せずにデータが透過される", ({
  expect,
}) => {
  // Arrange
  const checksum = new ChecksumMd5();
  const data = TEST_DATA;
  const context = { [ChecksumMd5.CHECKSUM_CONTEXT_KEY]: VALID_HASH };

  // Act
  const result = checksum.encode({ context, data });

  // Assert
  expect(result).toStrictEqual(data);
});

test("チェックサムを必須にして context にチェックサムキーが存在しないときに encode すると ChecksumRequiredError を投げる", ({
  expect,
}) => {
  // Arrange
  const checksum = new ChecksumMd5({ required: true });
  const data = TEST_DATA;
  const context = {};

  // Act & Assert
  expect(() => {
    checksum.encode({ context, data });
  }).toThrow(ChecksumRequiredError);
});
