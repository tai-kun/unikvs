import type { IMiddleware } from "@unikvs/core";
import { createEncodeContext, createNext, type TestContextValues } from "@unikvs/testing";
import { test } from "vitest";

import type Checksum from "../src/checksum.js";
import { ChecksumMismatchError, ChecksumRequiredError } from "../src/errors.js";
import ChecksumSha224 from "../src/sha224.js";

const TEST_DATA = Uint8Array.from(new TextEncoder().encode("test"));
const VALID_HASH = "90a3ed9e32b2aaf4c61c410eb925426119e1a9dc53d4286ade99a809";
const EMPTY_HASH = "d14a028c2a3a2bc9476102bb288234c415a2b01f828ea62ac5b3e42f";
const INVALID_HASH = "0".repeat(VALID_HASH.length);

/**
 * チェックサム付きでデータを検証して返します。
 */
async function encode(
  checksum: Checksum,
  data: Uint8Array<ArrayBuffer>,
  values?: TestContextValues,
): Promise<Uint8Array<ArrayBuffer>> {
  const c = createEncodeContext(data, "", { values });
  await checksum.encode(
    c as IMiddleware.EncodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
    createNext(),
  );

  return c.destination;
}

test("CHECKSUM_VAR_NAME が定義されている", ({ expect }) => {
  // 検証
  expect(ChecksumSha224.CHECKSUM_VAR_NAME).toBe("@unikvs/checksum:sha224");
});

test("指定した名前が name プロパティに設定される", ({ expect }) => {
  // 準備
  const checksum = new ChecksumSha224();

  // 実行と検証
  expect(checksum.name).toBe("ChecksumSha224");
});

test("期待値と一致するチェックサムを指定して encode すると、SHA-224 のハッシュで検証してデータをそのまま返す", async ({
  expect,
}) => {
  // 準備
  const checksum = new ChecksumSha224();

  // 実行
  const result = await encode(checksum, TEST_DATA, { [ChecksumSha224.CHECKSUM_VAR_NAME]: VALID_HASH });

  // 検証
  expect(result).toStrictEqual(TEST_DATA);
});

test("空のデータを SHA-224 のハッシュ値で検証できる", async ({ expect }) => {
  // 準備
  const checksum = new ChecksumSha224();
  const data = new Uint8Array(0);

  // 実行
  const result = await encode(checksum, data, { [ChecksumSha224.CHECKSUM_VAR_NAME]: EMPTY_HASH });

  // 検証
  expect(result).toStrictEqual(data);
});

test("期待値と一致しないチェックサムを指定すると、実際のハッシュ値を含む ChecksumMismatchError を投げる", async ({
  expect,
}) => {
  // 準備
  const checksum = new ChecksumSha224();

  // 実行と検証
  try {
    await encode(checksum, TEST_DATA, { [ChecksumSha224.CHECKSUM_VAR_NAME]: INVALID_HASH });
    expect.unreachable();
  } catch (error) {
    expect(error).toBeInstanceOf(ChecksumMismatchError);
    expect((error as ChecksumMismatchError).meta.actual).toBe(VALID_HASH);
  }
});

test("検証が必須のときにチェックサムが指定されていなければ ChecksumRequiredError を投げる", async ({
  expect,
}) => {
  // 準備
  const checksum = new ChecksumSha224({ required: true });

  // 実行と検証
  await expect(encode(checksum, TEST_DATA)).rejects.toThrow(ChecksumRequiredError);
});
