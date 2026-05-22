import { test } from "vitest";

import { ChecksumRequiredError } from "../src/errors.js";
import ChecksumSha512 from "../src/sha512.js";

const TEST_DATA = new TextEncoder().encode("test");
const VALID_HASH =
  "ee26b0dd4af7e749aa1a8ee3c10ae9923f618980772e473f8819a5d4940e0db27ac185f8a0e1d5f84f88bc887fd67b143732c304cc5fa9ad8e6f57f50028a8ff";

test("CHECKSUM_CONTEXT_KEY が定義されている", ({ expect }) => {
  // Assert
  expect(ChecksumSha512.CHECKSUM_CONTEXT_KEY).toBe("@unikvs/checksum:sha512");
});

test("インスタンスを作成したとき、指定した名前が name プロパティに正しく設定される", ({
  expect,
}) => {
  // Arrange
  const checksum = new ChecksumSha512();

  // Assert
  expect(checksum.name).toBe("ChecksumSha512");
});

test("context に正確なハッシュ値が含まれるとき、encode 処理で例外が発生せずにデータが透過される", ({
  expect,
}) => {
  // Arrange
  const checksum = new ChecksumSha512();
  const data = TEST_DATA;
  const context = { [ChecksumSha512.CHECKSUM_CONTEXT_KEY]: VALID_HASH };

  // Act
  const result = checksum.encode({ context, data });

  // Assert
  expect(result).toStrictEqual(data);
});

test("context に正確なハッシュ値が含まれるとき、encode 処理で例外が発生せずにデータが透過される", ({
  expect,
}) => {
  // Arrange
  const checksum = new ChecksumSha512();
  const data = TEST_DATA;
  const context = { [ChecksumSha512.CHECKSUM_CONTEXT_KEY]: VALID_HASH };

  // Act
  const result = checksum.encode({ context, data });

  // Assert
  expect(result).toStrictEqual(data);
});

test("チェックサムを必須にして context にチェックサムキーが存在しないときに encode すると ChecksumRequiredError を投げる", ({
  expect,
}) => {
  // Arrange
  const checksum = new ChecksumSha512({ required: true });
  const data = TEST_DATA;
  const context = {};

  // Act & Assert
  expect(() => {
    checksum.encode({ context, data });
  }).toThrow(ChecksumRequiredError);
});
