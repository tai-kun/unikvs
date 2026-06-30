import { test } from "vitest";

import { ChecksumRequiredError } from "../src/errors.js";
import ChecksumSha384 from "../src/sha384.js";

const TEST_DATA = new TextEncoder().encode("test");
const VALID_HASH =
  "768412320f7b0aa5812fce428dc4706b3cae50e02a64caa16a782249bfe8efc4b7ef1ccb126255d196047dfedf17a0a9";

test("CHECKSUM_CONTEXT_KEY が定義されている", ({ expect }) => {
  // 検証
  expect(ChecksumSha384.CHECKSUM_CONTEXT_KEY).toBe("@unikvs/checksum:sha384");
});

test("インスタンスを作成したとき、指定した名前が name プロパティに正しく設定される", ({
  expect,
}) => {
  // 準備
  const checksum = new ChecksumSha384();

  // 検証
  expect(checksum.name).toBe("ChecksumSha384");
});

test("context に正確なハッシュ値が含まれるとき、encode 処理で例外が発生せずにデータが透過される", ({
  expect,
}) => {
  // 準備
  const checksum = new ChecksumSha384();
  const data = TEST_DATA;
  const context = { [ChecksumSha384.CHECKSUM_CONTEXT_KEY]: VALID_HASH };

  // 実行
  const result = checksum.encode({ context, data });

  // 検証
  expect(result).toStrictEqual(data);
});

test("context に正確なハッシュ値が含まれるとき、encode 処理で例外が発生せずにデータが透過される", ({
  expect,
}) => {
  // 準備
  const checksum = new ChecksumSha384();
  const data = TEST_DATA;
  const context = { [ChecksumSha384.CHECKSUM_CONTEXT_KEY]: VALID_HASH };

  // 実行
  const result = checksum.encode({ context, data });

  // 検証
  expect(result).toStrictEqual(data);
});

test("チェックサムを必須にして context にチェックサムキーが存在しないときに encode すると ChecksumRequiredError を投げる", ({
  expect,
}) => {
  // 準備
  const checksum = new ChecksumSha384({ required: true });
  const data = TEST_DATA;
  const context = {};

  // 実行と検証
  expect(() => {
    checksum.encode({ context, data });
  }).toThrow(ChecksumRequiredError);
});
