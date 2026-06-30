import { test } from "vitest";

import { ChecksumRequiredError } from "../src/errors.js";
import ChecksumSha224 from "../src/sha224.js";

const TEST_DATA = new TextEncoder().encode("test");
const VALID_HASH = "90a3ed9e32b2aaf4c61c410eb925426119e1a9dc53d4286ade99a809";

test("CHECKSUM_CONTEXT_KEY が定義されている", ({ expect }) => {
  // 検証
  expect(ChecksumSha224.CHECKSUM_CONTEXT_KEY).toBe("@unikvs/checksum:sha224");
});

test("インスタンスを作成したとき、指定した名前が name プロパティに正しく設定される", ({
  expect,
}) => {
  // 準備
  const checksum = new ChecksumSha224();

  // 検証
  expect(checksum.name).toBe("ChecksumSha224");
});

test("context に正確なハッシュ値が含まれるとき、encode 処理で例外が発生せずにデータが透過される", ({
  expect,
}) => {
  // 準備
  const checksum = new ChecksumSha224();
  const data = TEST_DATA;
  const context = { [ChecksumSha224.CHECKSUM_CONTEXT_KEY]: VALID_HASH };

  // 実行
  const result = checksum.encode({ context, data });

  // 検証
  expect(result).toStrictEqual(data);
});

test("context に正確なハッシュ値が含まれるとき、encode 処理で例外が発生せずにデータが透過される", ({
  expect,
}) => {
  // 準備
  const checksum = new ChecksumSha224();
  const data = TEST_DATA;
  const context = { [ChecksumSha224.CHECKSUM_CONTEXT_KEY]: VALID_HASH };

  // 実行
  const result = checksum.encode({ context, data });

  // 検証
  expect(result).toStrictEqual(data);
});

test("チェックサムを必須にして context にチェックサムキーが存在しないときに encode すると ChecksumRequiredError を投げる", ({
  expect,
}) => {
  // 準備
  const checksum = new ChecksumSha224({ required: true });
  const data = TEST_DATA;
  const context = {};

  // 実行と検証
  expect(() => {
    checksum.encode({ context, data });
  }).toThrow(ChecksumRequiredError);
});
