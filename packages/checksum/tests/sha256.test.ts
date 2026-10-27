import type { IMiddleware } from "@unikvs/core";
import {
  type TestContextValues,
  createNext,
  sourceFrom,
  createDecodeContext,
  createEncodeContext,
  createEncodeStreamContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import type Checksum from "../src/checksum.js";
import { ChecksumMismatchError, ChecksumRequiredError } from "../src/errors.js";
import ChecksumSha256 from "../src/sha256.js";

const TEST_DATA = Uint8Array.from(new TextEncoder().encode("test"));
const VALID_HASH = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
const EMPTY_HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
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

/**
 * チャンク列を検証ストリームに流し、出力されたチャンクを返します。
 */
async function runEncodeStream(
  checksum: Checksum,
  inputChunks: readonly Uint8Array<ArrayBuffer>[],
  values?: TestContextValues,
): Promise<{
  closeError: unknown;
  outputChunks: Uint8Array<ArrayBuffer>[];
}> {
  const c = createEncodeStreamContext(sourceFrom(inputChunks), "", { values });
  await checksum.encodeStream(
    c as IMiddleware.EncodeStreamContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
    createNext(),
  );

  const outputChunks: Uint8Array<ArrayBuffer>[] = [];
  let closeError: unknown;

  try {
    const reader = (c.destination as ReadableStream<Uint8Array<ArrayBuffer>>).getReader();

    for (;;) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      outputChunks.push(value);
    }
  } catch (error) {
    closeError = error;
  }

  return {
    closeError,
    outputChunks,
  };
}

describe("ChecksumSha256", () => {
  test("CHECKSUM_VAR_NAME が定義されている", ({ expect }) => {
    // 検証：
    expect(ChecksumSha256.CHECKSUM_VAR_NAME).toBe("@unikvs/checksum:sha256");
  });

  test("CHECKSUM_ON_HASH_VAR_NAME が定義されている", ({ expect }) => {
    // 検証：
    expect(ChecksumSha256.CHECKSUM_ON_HASH_VAR_NAME).toBe("@unikvs/checksum:sha256:onHash");
  });

  test("指定した名前が name プロパティに設定される", ({ expect }) => {
    // 準備：
    const checksum = new ChecksumSha256();

    // 実行と検証：
    expect(checksum.name).toBe("ChecksumSha256");
  });

  test("期待値と一致するチェックサムを指定して encode すると、SHA-256 のハッシュで検証してデータをそのまま返す", async ({
    expect,
  }) => {
    // 準備：
    const checksum = new ChecksumSha256();

    // 実行：
    const result = await encode(checksum, TEST_DATA, {
      [ChecksumSha256.CHECKSUM_VAR_NAME]: VALID_HASH,
    });

    // 検証：
    expect(result).toStrictEqual(TEST_DATA);
  });

  test("空のデータを SHA-256 のハッシュ値で検証できる", async ({ expect }) => {
    // 準備：
    const checksum = new ChecksumSha256();
    const data = new Uint8Array(0);

    // 実行：
    const result = await encode(checksum, data, { [ChecksumSha256.CHECKSUM_VAR_NAME]: EMPTY_HASH });

    // 検証：
    expect(result).toStrictEqual(data);
  });

  test("期待値と一致しないチェックサムを指定すると、実際のハッシュ値を含む ChecksumMismatchError を投げる", async ({
    expect,
  }) => {
    // 準備：
    const checksum = new ChecksumSha256();

    // 実行と検証：
    try {
      await encode(checksum, TEST_DATA, { [ChecksumSha256.CHECKSUM_VAR_NAME]: INVALID_HASH });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ChecksumMismatchError);
      expect((error as ChecksumMismatchError).meta.actual).toBe(VALID_HASH);
    }
  });

  test("期待値と一致するチェックサムを指定して decode すると、データをそのまま返す", async ({
    expect,
  }) => {
    // 準備：
    const checksum = new ChecksumSha256();

    // 実行：
    const c = createDecodeContext(TEST_DATA, "", {
      values: { [ChecksumSha256.CHECKSUM_VAR_NAME]: VALID_HASH },
    });
    await checksum.decode(
      c as IMiddleware.DecodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
      createNext(),
    );

    // 検証：
    expect(c.destination).toStrictEqual(TEST_DATA);
  });

  test("検証が必須のときにチェックサムが指定されていなければ ChecksumRequiredError を投げる", async ({
    expect,
  }) => {
    // 準備：
    const checksum = new ChecksumSha256({ required: true });

    // 実行と検証：
    await expect(encode(checksum, TEST_DATA)).rejects.toThrow(ChecksumRequiredError);
  });
});

describe("onHash コールバック", () => {
  const ON_HASH_VAR_NAME = ChecksumSha256.CHECKSUM_ON_HASH_VAR_NAME;
  test("期待値なしでもハッシュを計算してコールバックへ渡す", async ({ expect }) => {
    // 準備：
    const checksum = new ChecksumSha256();
    const hashes: string[] = [];

    // 実行：
    const result = await encode(checksum, TEST_DATA, {
      [ON_HASH_VAR_NAME]: (hash: string): void => {
        hashes.push(hash);
      },
    });

    // 検証：
    expect(result).toStrictEqual(TEST_DATA);
    expect(hashes).toStrictEqual([VALID_HASH]);
  });
  test("第二引数に実行時変数のスナップショットを渡す", async ({ expect }) => {
    // 準備：
    const checksum = new ChecksumSha256();
    let snapshot: ReadonlyMap<string, unknown> | undefined;

    // 実行：
    await encode(checksum, TEST_DATA, {
      [ON_HASH_VAR_NAME]: (_hash: string, variables: ReadonlyMap<string, unknown>): void => {
        snapshot = variables;
      },
      region: "us-east-1",
    });

    // 検証：
    expect(snapshot?.get("region")).toBe("us-east-1");
    expect(snapshot?.has(ON_HASH_VAR_NAME)).toBe(true);
    expect(snapshot?.has(ChecksumSha256.CHECKSUM_VAR_NAME)).toBe(false);
  });
  test("期待値と一致したときもコールバックへハッシュを渡す", async ({ expect }) => {
    // 準備：
    const checksum = new ChecksumSha256();
    const hashes: string[] = [];

    // 実行：
    await encode(checksum, TEST_DATA, {
      [ChecksumSha256.CHECKSUM_VAR_NAME]: VALID_HASH,
      [ON_HASH_VAR_NAME]: (hash: string): void => {
        hashes.push(hash);
      },
    });

    // 検証：
    expect(hashes).toStrictEqual([VALID_HASH]);
  });
  test("期待値と一致しないときはコールバックを呼ばず ChecksumMismatchError を投げる", async ({
    expect,
  }) => {
    // 準備：
    const checksum = new ChecksumSha256();
    const hashes: string[] = [];

    // 実行と検証：
    await expect(
      encode(checksum, TEST_DATA, {
        [ChecksumSha256.CHECKSUM_VAR_NAME]: INVALID_HASH,
        [ON_HASH_VAR_NAME]: (hash: string): void => {
          hashes.push(hash);
        },
      }),
    ).rejects.toThrow(ChecksumMismatchError);
    expect(hashes).toStrictEqual([]);
  });
  test("required が true で期待値がないときはコールバックを指定しても ChecksumRequiredError を投げる", async ({
    expect,
  }) => {
    // 準備：
    const checksum = new ChecksumSha256({ required: true });

    // 実行と検証：
    await expect(
      encode(checksum, TEST_DATA, {
        [ON_HASH_VAR_NAME]: (): void => {},
      }),
    ).rejects.toThrow(ChecksumRequiredError);
  });
  test("非同期コールバックが拒否されると encode も失敗する", async ({ expect }) => {
    // 準備：
    const checksum = new ChecksumSha256();
    const error = new Error("onHash failed");

    // 実行と検証：
    await expect(
      encode(checksum, TEST_DATA, {
        [ON_HASH_VAR_NAME]: async (): Promise<void> => {
          await Promise.resolve();
          throw error;
        },
      }),
    ).rejects.toBe(error);
  });
  test("decode でもコールバックへハッシュを渡す", async ({ expect }) => {
    // 準備：
    const checksum = new ChecksumSha256();
    const hashes: string[] = [];
    const c = createDecodeContext(TEST_DATA, "", {
      values: {
        [ON_HASH_VAR_NAME]: (hash: string): void => {
          hashes.push(hash);
        },
      },
    });

    // 実行：
    await checksum.decode(
      c as IMiddleware.DecodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
      createNext(),
    );

    // 検証：
    expect(c.destination).toStrictEqual(TEST_DATA);
    expect(hashes).toStrictEqual([VALID_HASH]);
  });
});

describe("ストリームによる検証", () => {
  test("期待値と一致するチェックサムを指定すると、ストリーム全体のハッシュで検証して正常に閉じる", async ({
    expect,
  }) => {
    // 準備：
    const checksum = new ChecksumSha256();

    // 実行：
    const { closeError, outputChunks } = await runEncodeStream(checksum, [TEST_DATA], {
      [ChecksumSha256.CHECKSUM_VAR_NAME]: VALID_HASH,
    });

    // 検証：
    expect(closeError).toBeUndefined();
    expect(outputChunks).toStrictEqual([TEST_DATA]);
  });

  test("期待値と一致しないチェックサムを指定すると、ストリームを閉じたときに ChecksumMismatchError で失敗する", async ({
    expect,
  }) => {
    // 準備：
    const checksum = new ChecksumSha256();

    // 実行：
    const { closeError } = await runEncodeStream(checksum, [TEST_DATA], {
      [ChecksumSha256.CHECKSUM_VAR_NAME]: INVALID_HASH,
    });

    // 検証：
    expect(closeError).toBeInstanceOf(ChecksumMismatchError);
  });
});
