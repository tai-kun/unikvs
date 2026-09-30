import { sha256 } from "@noble/hashes/sha2.js";
import { describe, test } from "vitest";

import {
  Checksum,
  type IHash,
  type IHasher,
  ChecksumMismatchError,
  ChecksumSha256,
} from "../src/index.js";
import { concatChunks, runTransform, splitBySizes, toHex } from "./_helpers.js";

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
        update() {
          updateCount += 1;
          if (updateCount === 2) {
            throw new globalThis.Error("update failed");
          }
        },
        digest() {
          return new Uint8Array();
        },
      };
    },
  });
}

/**
 * チャンク処理中のハッシャー失敗を再現するためのサブクラスです。
 */
class FailingChecksum extends Checksum {
  public static override CHECKSUM_VAR_NAME: string = "@unikvs/checksum:test-failing";

  public constructor() {
    super("FailingChecksum", createFailingHash());
  }
}

describe("ストリームの透過", () => {
  test("複数のチャンクを書くと全チャンクがそのまま流れて検証に成功する", async ({ expect }) => {
    // 準備
    const checksum = new ChecksumSha256();
    const chunks = [DATA.subarray(0, 4), DATA.subarray(4, 20), DATA.subarray(20)];

    // 実行
    const { outputChunks, closeError } = await runTransform(
      checksum.getEncodable({ vars: { [VAR_NAME]: DIGEST } }),
      chunks,
    );

    // 検証
    expect(closeError).toBeUndefined();
    expect(outputChunks).toStrictEqual(chunks);
  });

  test("チャンクを 1 つも書かなくても空データとして検証に成功する", async ({ expect }) => {
    // 準備
    const checksum = new ChecksumSha256();

    // 実行
    const { outputChunks, closeError } = await runTransform(
      checksum.getEncodable({ vars: { [VAR_NAME]: EMPTY_DIGEST } }),
      [],
    );

    // 検証
    expect(closeError).toBeUndefined();
    expect(outputChunks).toStrictEqual([]);
  });

  test("多数のチャンクを順に処理できる", async ({ expect }) => {
    // 準備
    const checksum = new ChecksumSha256();
    const chunks = Array.from({ length: 100 }, (_, index) =>
      Uint8Array.from({ length: 7 }, (_, offset) => (index + offset) % 256),
    );
    const expected = toHex(sha256(concatChunks(chunks)));

    // 実行
    const { outputChunks, closeError } = await runTransform(
      checksum.getEncodable({ vars: { [VAR_NAME]: expected } }),
      chunks,
    );

    // 検証
    expect(closeError).toBeUndefined();
    expect(outputChunks).toStrictEqual(chunks);
  });

  test("ハッシュのブロック境界をまたぐ分割でも一括検証と一致する", async ({ expect }) => {
    // 準備
    const checksum = new ChecksumSha256();
    const data = Uint8Array.from({ length: 700 }, (_, index) => (index * 7) % 256);
    const chunks = splitBySizes(data, [1, 54, 55, 56, 63, 64, 65, 127, 128, 129]);

    // 実行
    const { outputChunks, closeError } = await runTransform(
      checksum.getEncodable({ vars: { [VAR_NAME]: toHex(sha256(data)) } }),
      chunks,
    );

    // 検証
    expect(closeError).toBeUndefined();
    expect(toHex(concatChunks(outputChunks))).toBe(toHex(data));
  });

  test("getDecodable でも複数のチャンクがそのまま流れる", async ({ expect }) => {
    // 準備
    const checksum = new ChecksumSha256();
    const chunks = [DATA.subarray(0, 10), DATA.subarray(10, 20), DATA.subarray(20)];

    // 実行
    const { outputChunks, closeError } = await runTransform(
      checksum.getDecodable({ vars: { [VAR_NAME]: DIGEST } }),
      chunks,
    );

    // 検証
    expect(closeError).toBeUndefined();
    expect(outputChunks).toStrictEqual(chunks);
  });

  test("チェックサム未指定の getDecodable はハッシュを計算せずに透過する", async ({ expect }) => {
    // 準備
    const checksum = new ChecksumSha256();

    // 実行
    const { outputChunks, closeError } = await runTransform(checksum.getDecodable({ vars: {} }), [
      DATA,
    ]);

    // 検証
    expect(closeError).toBeUndefined();
    expect(outputChunks).toStrictEqual([DATA]);
  });
});

describe("不一致の検出", () => {
  test("不一致のときは ChecksumMismatchError で失敗し meta に actual と expected を保持する", async ({
    expect,
  }) => {
    // 準備
    const checksum = new ChecksumSha256();
    const expected = "0".repeat(DIGEST.length);

    // 実行
    const { closeError } = await runTransform(
      checksum.getEncodable({ vars: { [VAR_NAME]: expected } }),
      [DATA],
    );

    // 検証
    expect(closeError).toBeInstanceOf(ChecksumMismatchError);
    expect((closeError as ChecksumMismatchError).meta).toStrictEqual({
      actual: DIGEST,
      expected,
    });
  });

  test("不一致のストリームを下流に接続すると ChecksumMismatchError が伝播する", async ({
    expect,
  }) => {
    // 準備
    const checksum = new ChecksumSha256();
    const transformStream = checksum.getEncodable({
      vars: { [VAR_NAME]: "0".repeat(DIGEST.length) },
    });
    const sink = new WritableStream<Uint8Array<ArrayBuffer>>();

    // 実行
    const pipeResult = transformStream.readable.pipeTo(sink).catch((error: unknown) => error);
    const writer = transformStream.writable.getWriter();
    const writeError = await writer.write(DATA).then(
      () => writer.close().catch((error: unknown) => error),
      (error: unknown) => error,
    );

    // 検証
    expect(await pipeResult).toBeInstanceOf(ChecksumMismatchError);
    expect(writeError).toBeInstanceOf(ChecksumMismatchError);
  });
});

describe("処理中のエラー", () => {
  test("ハッシャーの update が失敗するとそのエラーがストリームに伝播する", async ({ expect }) => {
    // 準備
    const checksum = new FailingChecksum();
    const transformStream = checksum.getEncodable({
      vars: { [FailingChecksum.CHECKSUM_VAR_NAME]: "" },
    });

    // 実行
    const { closeError } = await runTransform(transformStream, [
      new Uint8Array([1]),
      new Uint8Array([2]),
    ]);

    // 検証
    expect(closeError).toBeInstanceOf(globalThis.Error);
    expect((closeError as globalThis.Error).message).toBe("update failed");
  });
});
