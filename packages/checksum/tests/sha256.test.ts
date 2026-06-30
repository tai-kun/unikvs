import { test } from "vitest";

import { ChecksumRequiredError } from "../src/errors.js";
import ChecksumSha256 from "../src/sha256.js";

const TEST_DATA = new TextEncoder().encode("test");
const VALID_HASH = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";

test("CHECKSUM_CONTEXT_KEY が定義されている", ({ expect }) => {
  // 検証
  expect(ChecksumSha256.CHECKSUM_CONTEXT_KEY).toBe("@unikvs/checksum:sha256");
});

test("インスタンスを作成したとき、指定した名前が name プロパティに正しく設定される", ({
  expect,
}) => {
  // 準備
  const checksum = new ChecksumSha256();

  // 検証
  expect(checksum.name).toBe("ChecksumSha256");
});

test("context に正確なハッシュ値が含まれるとき、encode 処理で例外が発生せずにデータが透過される", ({
  expect,
}) => {
  // 準備
  const checksum = new ChecksumSha256();
  const data = TEST_DATA;
  const context = { [ChecksumSha256.CHECKSUM_CONTEXT_KEY]: VALID_HASH };

  // 実行
  const result = checksum.encode({ context, data });

  // 検証
  expect(result).toStrictEqual(data);
});

test("context に正確なハッシュ値が含まれるとき、encode 処理で例外が発生せずにデータが透過される", ({
  expect,
}) => {
  // 準備
  const checksum = new ChecksumSha256();
  const data = TEST_DATA;
  const context = { [ChecksumSha256.CHECKSUM_CONTEXT_KEY]: VALID_HASH };

  // 実行
  const result = checksum.encode({ context, data });

  // 検証
  expect(result).toStrictEqual(data);
});

test("チェックサムを必須にして context にチェックサムキーが存在しないときに encode すると ChecksumRequiredError を投げる", ({
  expect,
}) => {
  // 準備
  const checksum = new ChecksumSha256({ required: true });
  const data = TEST_DATA;
  const context = {};

  // 実行と検証
  expect(() => {
    checksum.encode({ context, data });
  }).toThrow(ChecksumRequiredError);
});
