import { sha256 } from "@noble/hashes/sha2.js";
import type { IMiddleware, IPipelineContext } from "@unikvs/core";
import {
  type TestContextValues,
  toHex,
  createNext,
  sourceFrom,
  concatChunks,
  splitBySizes,
  createDecodeStreamContext,
  createEncodeStreamContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import {
  type IHash,
  type IHasher,
  Checksum,
  ChecksumSha256,
  ChecksumMismatchError,
  ChecksumRequiredError,
} from "../src/index.js";

const VAR_NAME = ChecksumSha256.CHECKSUM_VAR_NAME;
const DATA = Uint8Array.from(
  new TextEncoder().encode("The quick brown fox jumps over the lazy dog"),
);
const DIGEST = toHex(sha256(DATA));
const EMPTY_DIGEST = toHex(sha256(new Uint8Array(0)));

/**
 * 2 回目の update で必ず失敗する IHash を作成します。
 * チャンク処理中にハッシャーが失敗したときのエラー伝播を検証するために使用します。
 */
function createFailingHash(): IHash {
  let updateCount = 0;

  return Object.assign(() => new Uint8Array(), {
    create(): IHasher {
      return {
        digest() {
          return new Uint8Array();
        },
        update() {
          updateCount += 1;
          if (updateCount === 2) {
            throw new globalThis.Error("update failed");
          }
        },
      };
    },
  });
}

/**
 * チャンク処理中のハッシャー失敗を再現するためのサブクラスです。
 */
class FailingChecksum extends Checksum {
  public static override CHECKSUM_VAR_NAME = "@unikvs/checksum:test-failing";

  public constructor() {
    super("FailingChecksum", createFailingHash());
  }
}

/**
 * チャンク列を検証ストリームに流し、出力されたチャンクと終了時のエラーを返します。
 */
async function runEncodeStream(
  checksum: Checksum,
  inputChunks: readonly Uint8Array<ArrayBuffer>[],
  values?: TestContextValues,
): Promise<{
  context: IPipelineContext;
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
    context: c,
    closeError,
    outputChunks,
  };
}

/**
 * チャンク列を検証ストリームに流し、出力されたチャンクと終了時のエラーを返します。
 */
async function runDecodeStream(
  checksum: Checksum,
  inputChunks: readonly Uint8Array<ArrayBuffer>[],
  values?: TestContextValues,
): Promise<{
  closeError: unknown;
  outputChunks: Uint8Array<ArrayBuffer>[];
}> {
  const c = createDecodeStreamContext(sourceFrom(inputChunks), "", { values });
  await checksum.decodeStream(
    c as IMiddleware.DecodeStreamContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
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

describe("ストリームの透過", () => {
  test("複数のチャンクを書くと全チャンクがそのまま流れて検証に成功する", async ({ expect }) => {
    // 準備：
    const checksum = new ChecksumSha256();
    const chunks = [DATA.subarray(0, 4), DATA.subarray(4, 20), DATA.subarray(20)];

    // 実行：
    const { closeError, outputChunks } = await runEncodeStream(checksum, chunks, {
      [VAR_NAME]: DIGEST,
    });

    // 検証：
    expect(closeError).toBeUndefined();
    expect(outputChunks).toStrictEqual(chunks);
  });

  test("チャンクを 1 つも書かなくても空データとして検証に成功する", async ({ expect }) => {
    // 準備：
    const checksum = new ChecksumSha256();

    // 実行：
    const { closeError, outputChunks } = await runEncodeStream(checksum, [], {
      [VAR_NAME]: EMPTY_DIGEST,
    });

    // 検証：
    expect(closeError).toBeUndefined();
    expect(outputChunks).toStrictEqual([]);
  });

  test("多数のチャンクを順に処理できる", async ({ expect }) => {
    // 準備：
    const checksum = new ChecksumSha256();
    const chunks = Array.from({ length: 100 }, (_, index) =>
      Uint8Array.from({ length: 7 }, (__unused, offset) => (index + offset) % 256),
    );
    const expected = toHex(sha256(concatChunks(chunks)));

    // 実行：
    const { closeError, outputChunks } = await runEncodeStream(checksum, chunks, {
      [VAR_NAME]: expected,
    });

    // 検証：
    expect(closeError).toBeUndefined();
    expect(outputChunks).toStrictEqual(chunks);
  });

  test("ハッシュのブロック境界をまたぐ分割でも一括検証と一致する", async ({ expect }) => {
    // 準備：
    const checksum = new ChecksumSha256();
    const data = Uint8Array.from({ length: 700 }, (_, index) => (index * 7) % 256);
    const chunks = splitBySizes(data, [1, 54, 55, 56, 63, 64, 65, 127, 128, 129]);

    // 実行：
    const { closeError, outputChunks } = await runEncodeStream(checksum, chunks, {
      [VAR_NAME]: toHex(sha256(data)),
    });

    // 検証：
    expect(closeError).toBeUndefined();
    expect(toHex(concatChunks(outputChunks))).toBe(toHex(data));
  });

  test("decodeStream でも複数のチャンクがそのまま流れる", async ({ expect }) => {
    // 準備：
    const checksum = new ChecksumSha256();
    const chunks = [DATA.subarray(0, 10), DATA.subarray(10, 20), DATA.subarray(20)];

    // 実行：
    const { closeError, outputChunks } = await runDecodeStream(checksum, chunks, {
      [VAR_NAME]: DIGEST,
    });

    // 検証：
    expect(closeError).toBeUndefined();
    expect(outputChunks).toStrictEqual(chunks);
  });

  test("チェックサム未指定の decodeStream はハッシュを計算せずに透過する", async ({ expect }) => {
    // 準備：
    const checksum = new ChecksumSha256();

    // 実行：
    const { closeError, outputChunks } = await runDecodeStream(checksum, [DATA]);

    // 検証：
    expect(closeError).toBeUndefined();
    expect(outputChunks).toStrictEqual([DATA]);
  });
});

describe("不一致の検出", () => {
  test("不一致のときは ChecksumMismatchError で失敗し meta に actual と expected を保持する", async ({
    expect,
  }) => {
    // 準備：
    const checksum = new ChecksumSha256();
    const expected = "0".repeat(DIGEST.length);

    // 実行：
    const { closeError } = await runEncodeStream(checksum, [DATA], { [VAR_NAME]: expected });

    // 検証：
    expect(closeError).toBeInstanceOf(ChecksumMismatchError);
    expect((closeError as ChecksumMismatchError).meta).toStrictEqual({
      actual: DIGEST,
      expected,
    });
  });

  test("不一致のストリームを下流に接続すると ChecksumMismatchError が伝播する", async ({
    expect,
  }) => {
    // 準備：
    const checksum = new ChecksumSha256();
    const c = createEncodeStreamContext(sourceFrom([DATA]), "", {
      values: { [VAR_NAME]: "0".repeat(DIGEST.length) },
    });
    await checksum.encodeStream(
      c as IMiddleware.EncodeStreamContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
      createNext(),
    );

    const sink = new WritableStream<Uint8Array<ArrayBuffer>>();

    // 実行：
    let pipeError: unknown;

    try {
      await (c.destination as ReadableStream<Uint8Array<ArrayBuffer>>).pipeTo(sink);
    } catch (error) {
      pipeError = error;
    }

    // 検証：
    expect(pipeError).toBeInstanceOf(ChecksumMismatchError);
  });
});

describe("onHash コールバック", () => {
  const ON_HASH_VAR_NAME = ChecksumSha256.CHECKSUM_ON_HASH_VAR_NAME;
  test("ストリームの終了時にハッシュをコールバックへ渡す", async ({ expect }) => {
    // 準備：
    const checksum = new ChecksumSha256();
    const hashes: string[] = [];
    const chunks = [DATA.subarray(0, 10), DATA.subarray(10)];

    // 実行：
    const { closeError, outputChunks } = await runEncodeStream(checksum, chunks, {
      [ON_HASH_VAR_NAME]: (_c: IPipelineContext, hash: string): void => {
        hashes.push(hash);
      },
    });

    // 検証：
    expect(closeError).toBeUndefined();
    expect(outputChunks).toStrictEqual(chunks);
    expect(hashes).toStrictEqual([DIGEST]);
  });
  test("コールバックの this にインスタンスを、第一引数にコンテキストを渡す", async ({ expect }) => {
    // 準備：
    const checksum = new ChecksumSha256();
    const thisArgs: unknown[] = [];
    const contexts: IPipelineContext[] = [];
    const hashes: string[] = [];

    function onHash(this: unknown, context: IPipelineContext, hash: string): void {
      thisArgs.push(this);
      contexts.push(context);
      hashes.push(hash);
    }

    // 実行：
    const { context, closeError } = await runEncodeStream(checksum, [DATA], {
      [ON_HASH_VAR_NAME]: onHash,
    });

    // 検証：
    expect(closeError).toBeUndefined();

    expect(thisArgs).toHaveLength(1);
    expect(thisArgs[0]).toBe(checksum);
    expect(contexts).toStrictEqual([context]);
    expect(hashes).toStrictEqual([DIGEST]);
  });
  test("decodeStream の終了時にもハッシュをコールバックへ渡す", async ({ expect }) => {
    // 準備：
    const checksum = new ChecksumSha256();
    const hashes: string[] = [];

    // 実行：
    const { closeError } = await runDecodeStream(checksum, [DATA], {
      [ON_HASH_VAR_NAME]: (_c: IPipelineContext, hash: string): void => {
        hashes.push(hash);
      },
    });

    // 検証：
    expect(closeError).toBeUndefined();
    expect(hashes).toStrictEqual([DIGEST]);
  });
  test("期待値と一致しないときはコールバックを呼ばない", async ({ expect }) => {
    // 準備：
    const checksum = new ChecksumSha256();
    const hashes: string[] = [];

    // 実行：
    const { closeError } = await runEncodeStream(checksum, [DATA], {
      [VAR_NAME]: "0".repeat(DIGEST.length),
      [ON_HASH_VAR_NAME]: (_c: IPipelineContext, hash: string): void => {
        hashes.push(hash);
      },
    });

    // 検証：
    expect(closeError).toBeInstanceOf(ChecksumMismatchError);
    expect(hashes).toStrictEqual([]);
  });
  test("required が true で期待値がないときはコールバックを指定しても ChecksumRequiredError を投げる", async ({
    expect,
  }) => {
    // 準備：
    const checksum = new ChecksumSha256({ required: true });
    const c = createEncodeStreamContext(sourceFrom([DATA]), "", {
      values: {
        [ON_HASH_VAR_NAME]: (): void => {},
      },
    });

    // 実行と検証：
    await expect(
      checksum.encodeStream(
        c as IMiddleware.EncodeStreamContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
        createNext(),
      ),
    ).rejects.toThrow(ChecksumRequiredError);
  });
  test("非同期コールバックが拒否されるとストリームも失敗する", async ({ expect }) => {
    // 準備：
    const checksum = new ChecksumSha256();
    const error = new Error("onHash failed");

    // 実行：
    const { closeError } = await runEncodeStream(checksum, [DATA], {
      [ON_HASH_VAR_NAME]: async (): Promise<void> => {
        await Promise.resolve();
        throw error;
      },
    });

    // 検証：
    expect(closeError).toBe(error);
  });
});

describe("処理中のエラー", () => {
  test("ハッシャーの update が失敗するとそのエラーがストリームに伝播する", async ({ expect }) => {
    // 準備：
    const checksum = new FailingChecksum();

    // 実行：
    const { closeError } = await runEncodeStream(
      checksum,
      [new Uint8Array([1]), new Uint8Array([2])],
      { [FailingChecksum.CHECKSUM_VAR_NAME]: "" },
    );

    // 検証：
    expect(closeError).toBeInstanceOf(globalThis.Error);
    expect((closeError as globalThis.Error).message).toBe("update failed");
  });
});
