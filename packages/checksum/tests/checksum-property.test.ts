import { md5, sha1 } from "@noble/hashes/legacy.js";
import { sha224, sha256, sha384, sha512 } from "@noble/hashes/sha2.js";
import type { IMiddleware } from "@unikvs/core";
import {
  toHex,
  createNext,
  sourceFrom,
  concatChunks,
  forCasesAsync,
  createEncodeContext,
  createEncodeStreamContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

import type Checksum from "../src/checksum.js";
import {
  type ChecksumOptions,
  ChecksumMd5,
  ChecksumSha1,
  ChecksumSha224,
  ChecksumSha256,
  ChecksumSha384,
  ChecksumSha512,
  ChecksumMismatchError,
} from "../src/index.js";

const ALGORITHMS = [
  {
    label: "MD5",
    create: (options?: ChecksumOptions): ChecksumMd5 => new ChecksumMd5(options),
    varName: "@unikvs/checksum:md5",
    digestOf: (data: Uint8Array): string => toHex(md5(data)),
  },
  {
    label: "SHA-1",
    create: (options?: ChecksumOptions): ChecksumSha1 => new ChecksumSha1(options),
    varName: "@unikvs/checksum:sha1",
    digestOf: (data: Uint8Array): string => toHex(sha1(data)),
  },
  {
    label: "SHA-224",
    create: (options?: ChecksumOptions): ChecksumSha224 => new ChecksumSha224(options),
    varName: "@unikvs/checksum:sha224",
    digestOf: (data: Uint8Array): string => toHex(sha224(data)),
  },
  {
    label: "SHA-256",
    create: (options?: ChecksumOptions): ChecksumSha256 => new ChecksumSha256(options),
    varName: "@unikvs/checksum:sha256",
    digestOf: (data: Uint8Array): string => toHex(sha256(data)),
  },
  {
    label: "SHA-384",
    create: (options?: ChecksumOptions): ChecksumSha384 => new ChecksumSha384(options),
    varName: "@unikvs/checksum:sha384",
    digestOf: (data: Uint8Array): string => toHex(sha384(data)),
  },
  {
    label: "SHA-512",
    create: (options?: ChecksumOptions): ChecksumSha512 => new ChecksumSha512(options),
    varName: "@unikvs/checksum:sha512",
    digestOf: (data: Uint8Array): string => toHex(sha512(data)),
  },
] as const;

/**
 * データを検証してそのまま返します。
 */
async function encode(
  checksum: Checksum,
  data: Uint8Array<ArrayBuffer>,
  values?: Record<string, unknown>,
): Promise<Uint8Array<ArrayBuffer>> {
  const c = createEncodeContext(data, "", { values });
  await checksum.encode(
    c as IMiddleware.EncodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
    createNext(),
  );

  return c.destination;
}

/**
 * チャンク列を検証ストリームに流し、出力されたチャンクと終了時のエラーを返します。
 */
async function runEncodeStream(
  checksum: Checksum,
  inputChunks: readonly Uint8Array<ArrayBuffer>[],
  values?: Record<string, unknown>,
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

describe("プロパティベースの検証", () => {
  test("ランダムなチャンク分割でもストリーム検証が一括検証と同じ結果になる", async ({ expect }) => {
    // 準備：
    const checksum = new ChecksumSha256();

    // 実行と検証：
    await forCasesAsync(20_240_930, 100, async (random) => {
      const chunks = random.array(random.int(0, 16), (generator) =>
        generator.bytes(generator.int(0, 32)),
      );
      const data = concatChunks(chunks);

      const { closeError, outputChunks } = await runEncodeStream(checksum, chunks, {
        [ChecksumSha256.CHECKSUM_VAR_NAME]: toHex(sha256(data)),
      });
      expect(closeError).toBeUndefined();
      expect(toHex(concatChunks(outputChunks))).toBe(toHex(data));
    });
  });

  test("期待値が実際のダイジェストと異なれば必ず ChecksumMismatchError になる", async ({
    expect,
  }) => {
    // 準備：
    const checksum = new ChecksumSha256();

    // 実行と検証：
    await forCasesAsync(12_345, 50, async (random) => {
      const data = random.bytes(random.int(0, 256));
      const actual = toHex(sha256(data));
      const expected = `${actual}0`;

      let thrown: unknown;

      try {
        await encode(checksum, data, { [ChecksumSha256.CHECKSUM_VAR_NAME]: expected });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(ChecksumMismatchError);
      expect((thrown as ChecksumMismatchError).meta).toStrictEqual({
        actual,
        expected,
      });
    });
  });

  test("全 6 アルゴリズムでランダムデータのダイジェスト検証に成功する", async ({ expect }) => {
    // 実行と検証：
    await forCasesAsync(67_890, 50, async (random) => {
      const algorithm = random.pick(ALGORITHMS);
      const data = random.bytes(random.int(0, 128));

      const result = await encode(algorithm.create(), data, {
        [algorithm.varName]: algorithm.digestOf(data),
      });
      expect(result).toBe(data);
    });
  });
});
