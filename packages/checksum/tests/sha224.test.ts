import { test } from "vitest";

import { ChecksumRequiredError } from "../src/errors.js";
import ChecksumSha224 from "../src/sha224.js";

const TEST_DATA = new TextEncoder().encode("test");
const VALID_HASH = "90a3ed9e32b2aaf4c61c410eb925426119e1a9dc53d4286ade99a809";

test("CHECKSUM_CONTEXT_KEY が定義されている", ({ expect }) => {
  // Assert
  expect(ChecksumSha224.CHECKSUM_CONTEXT_KEY).toBe("@unikvs/checksum:sha224");
});

test("インスタンスを作成したとき、指定した名前が name プロパティに正しく設定される", ({
  expect,
}) => {
  // Arrange
  const checksum = new ChecksumSha224();

  // Assert
  expect(checksum.name).toBe("ChecksumSha224");
});

test("context に正確なハッシュ値が含まれるとき、encode 処理で例外が発生せずにデータが透過される", ({
  expect,
}) => {
  // Arrange
  const checksum = new ChecksumSha224();
  const data = TEST_DATA;
  const context = { [ChecksumSha224.CHECKSUM_CONTEXT_KEY]: VALID_HASH };

  // Act
  const result = checksum.encode({ context, data });

  // Assert
  expect(result).toStrictEqual(data);
});

test("context に正確なハッシュ値が含まれるとき、encode 処理で例外が発生せずにデータが透過される", ({
  expect,
}) => {
  // Arrange
  const checksum = new ChecksumSha224();
  const data = TEST_DATA;
  const context = { [ChecksumSha224.CHECKSUM_CONTEXT_KEY]: VALID_HASH };

  // Act
  const result = checksum.encode({ context, data });

  // Assert
  expect(result).toStrictEqual(data);
});

test("チェックサムを必須にして context にチェックサムキーが存在しないときに encode すると ChecksumRequiredError を投げる", ({
  expect,
}) => {
  // Arrange
  const checksum = new ChecksumSha224({ required: true });
  const data = TEST_DATA;
  const context = {};

  // Act & Assert
  expect(() => {
    checksum.encode({ context, data });
  }).toThrow(ChecksumRequiredError);
});
