import { test } from "vitest";

import { ChecksumRequiredError } from "../src/errors.js";
import ChecksumSha1 from "../src/sha1.js";

const TEST_DATA = new TextEncoder().encode("test");
const VALID_HASH = "a94a8fe5ccb19ba61c4c0873d391e987982fbbd3";

test("CHECKSUM_CONTEXT_KEY が定義されている", ({ expect }) => {
  // Assert
  expect(ChecksumSha1.CHECKSUM_CONTEXT_KEY).toBe("@unikvs/checksum:sha1");
});

test("インスタンスを作成したとき、指定した名前が name プロパティに正しく設定される", ({
  expect,
}) => {
  // Arrange
  const checksum = new ChecksumSha1();

  // Assert
  expect(checksum.name).toBe("ChecksumSha1");
});

test("context に正確なハッシュ値が含まれるとき、encode 処理で例外が発生せずにデータが透過される", ({
  expect,
}) => {
  // Arrange
  const checksum = new ChecksumSha1();
  const data = TEST_DATA;
  const context = { [ChecksumSha1.CHECKSUM_CONTEXT_KEY]: VALID_HASH };

  // Act
  const result = checksum.encode({ context, data });

  // Assert
  expect(result).toStrictEqual(data);
});

test("チェックサムを必須にして context にチェックサムキーが存在しないときに encode すると ChecksumRequiredError を投げる", ({
  expect,
}) => {
  // Arrange
  const checksum = new ChecksumSha1({ required: true });
  const data = TEST_DATA;
  const context = {};

  // Act & Assert
  expect(() => {
    checksum.encode({ context, data });
  }).toThrow(ChecksumRequiredError);
});
