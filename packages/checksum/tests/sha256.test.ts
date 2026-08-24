import { describe, test } from "vitest";

import { ChecksumMismatchError, ChecksumRequiredError } from "../src/errors.js";
import ChecksumSha256 from "../src/sha256.js";

const TEST_DATA = Uint8Array.from(new TextEncoder().encode("test"));
const VALID_HASH = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
const EMPTY_HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const INVALID_HASH = "0".repeat(VALID_HASH.length);

/**
 * 変換ストリームにチャンクを順に書き込み、読み取れるデータをすべて読み取る補助関数です。
 * バックプレッシャーによるデッドロックを避けるため、書き込みと読み取りを並行して行います。
 */
async function runTransform(
  stream: TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
  inputChunks: Uint8Array<ArrayBuffer>[],
): Promise<{ outputChunks: Uint8Array<ArrayBuffer>[]; closeError: unknown }> {
  const outputChunks: Uint8Array<ArrayBuffer>[] = [];
  let closeError: unknown;
  const reader = stream.readable.getReader();
  const writer = stream.writable.getWriter();

  const pumping = (async () => {
    for (const chunk of inputChunks) {
      await writer.write(chunk);
    }

    try {
      await writer.close();
    } catch (error) {
      closeError = error;
    }
  })();

  while (true) {
    try {
      const { done, value } = await reader.read();
      if (done) break;
      outputChunks.push(value);
    } catch (error) {
      closeError ??= error;
      break;
    }
  }

  await pumping;

  return { outputChunks, closeError };
}

test("CHECKSUM_CONTEXT_KEY が定義されている", ({ expect }) => {
  // 検証
  expect(ChecksumSha256.CHECKSUM_CONTEXT_KEY).toBe("@unikvs/checksum:sha256");
});

test("指定した名前が name プロパティに設定される", ({ expect }) => {
  // 準備
  const checksum = new ChecksumSha256();

  // 実行と検証
  expect(checksum.name).toBe("ChecksumSha256");
});

test("期待値と一致するチェックサムを指定して encode すると、SHA-256 のハッシュで検証してデータをそのまま返す", ({
  expect,
}) => {
  // 準備
  const checksum = new ChecksumSha256();
  const context = { [ChecksumSha256.CHECKSUM_CONTEXT_KEY]: VALID_HASH };

  // 実行
  const result = checksum.encode({ context, data: TEST_DATA });

  // 検証
  expect(result).toStrictEqual(TEST_DATA);
});

test("空のデータを SHA-256 のハッシュ値で検証できる", ({ expect }) => {
  // 準備
  const checksum = new ChecksumSha256();
  const data = new Uint8Array(0);
  const context = { [ChecksumSha256.CHECKSUM_CONTEXT_KEY]: EMPTY_HASH };

  // 実行
  const result = checksum.encode({ context, data });

  // 検証
  expect(result).toStrictEqual(data);
});

test("期待値と一致しないチェックサムを指定すると、実際のハッシュ値を含む ChecksumMismatchError を投げる", ({
  expect,
}) => {
  // 準備
  const checksum = new ChecksumSha256();
  const context = { [ChecksumSha256.CHECKSUM_CONTEXT_KEY]: INVALID_HASH };

  // 実行と検証
  try {
    checksum.encode({ context, data: TEST_DATA });
    expect.unreachable();
  } catch (error) {
    expect(error).toBeInstanceOf(ChecksumMismatchError);
    expect((error as ChecksumMismatchError).meta.actual).toBe(VALID_HASH);
  }
});

test("期待値と一致するチェックサムを指定して decode すると、データをそのまま返す", ({ expect }) => {
  // 準備
  const checksum = new ChecksumSha256();
  const context = { [ChecksumSha256.CHECKSUM_CONTEXT_KEY]: VALID_HASH };

  // 実行
  const result = checksum.decode({ context, data: TEST_DATA });

  // 検証
  expect(result).toStrictEqual(TEST_DATA);
});

test("検証が必須のときにチェックサムが指定されていなければ ChecksumRequiredError を投げる", ({
  expect,
}) => {
  // 準備
  const checksum = new ChecksumSha256({ required: true });

  // 実行と検証
  expect(() => checksum.encode({ context: {}, data: TEST_DATA })).toThrow(ChecksumRequiredError);
});

describe("ストリームによる検証", () => {
  test("期待値と一致するチェックサムを指定すると、ストリーム全体のハッシュで検証して正常に閉じる", async ({
    expect,
  }) => {
    // 準備
    const checksum = new ChecksumSha256();
    const transformStream = checksum.getEncodable({
      context: { [ChecksumSha256.CHECKSUM_CONTEXT_KEY]: VALID_HASH },
    });

    // 実行
    const { outputChunks, closeError } = await runTransform(transformStream, [TEST_DATA]);

    // 検証
    expect(closeError).toBeUndefined();
    expect(outputChunks).toStrictEqual([TEST_DATA]);
  });

  test("期待値と一致しないチェックサムを指定すると、ストリームを閉じたときに ChecksumMismatchError で失敗する", async ({
    expect,
  }) => {
    // 準備
    const checksum = new ChecksumSha256();
    const transformStream = checksum.getEncodable({
      context: { [ChecksumSha256.CHECKSUM_CONTEXT_KEY]: INVALID_HASH },
    });

    // 実行
    const { closeError } = await runTransform(transformStream, [TEST_DATA]);

    // 検証
    expect(closeError).toBeInstanceOf(ChecksumMismatchError);
  });
});
