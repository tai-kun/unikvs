import { md5, sha1 } from "@noble/hashes/legacy.js";
import { sha224, sha256, sha384, sha512 } from "@noble/hashes/sha2.js";
import type { IMiddleware } from "@unikvs/core";
import {
  concatChunks,
  createEncodeContext,
  createEncodeStreamContext,
  createNext,
  sourceFrom,
  toHex,
} from "@unikvs/testing";
import { forCasesAsync } from "@unikvs/testing";
import { test } from "vitest";

import type Checksum from "../src/checksum.js";
import {
  type ChecksumOptions,
  ChecksumMd5,
  ChecksumMismatchError,
  ChecksumSha1,
  ChecksumSha224,
  ChecksumSha256,
  ChecksumSha384,
  ChecksumSha512,
} from "../src/index.js";

const ALGORITHMS = [
  {
    label: "MD5",
    varName: "@unikvs/checksum:md5",
    digestOf: (data: Uint8Array) => toHex(md5(data)),
    create: (options?: ChecksumOptions) => new ChecksumMd5(options),
  },
  {
    label: "SHA-1",
    varName: "@unikvs/checksum:sha1",
    digestOf: (data: Uint8Array) => toHex(sha1(data)),
    create: (options?: ChecksumOptions) => new ChecksumSha1(options),
  },
  {
    label: "SHA-224",
    varName: "@unikvs/checksum:sha224",
    digestOf: (data: Uint8Array) => toHex(sha224(data)),
    create: (options?: ChecksumOptions) => new ChecksumSha224(options),
  },
  {
    label: "SHA-256",
    varName: "@unikvs/checksum:sha256",
    digestOf: (data: Uint8Array) => toHex(sha256(data)),
    create: (options?: ChecksumOptions) => new ChecksumSha256(options),
  },
  {
    label: "SHA-384",
    varName: "@unikvs/checksum:sha384",
    digestOf: (data: Uint8Array) => toHex(sha384(data)),
    create: (options?: ChecksumOptions) => new ChecksumSha384(options),
  },
  {
    label: "SHA-512",
    varName: "@unikvs/checksum:sha512",
    digestOf: (data: Uint8Array) => toHex(sha512(data)),
    create: (options?: ChecksumOptions) => new ChecksumSha512(options),
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
): Promise<{ outputChunks: Uint8Array<ArrayBuffer>[]; closeError: unknown }> {
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

  return { outputChunks, closeError };
}

test("ランダムなチャンク分割でもストリーム検証が一括検証と同じ結果になる", async ({ expect }) => {
  // 準備
  const checksum = new ChecksumSha256();

  // 実行と検証
  await forCasesAsync(20240930, 100, async (random) => {
    const chunks = random.array(random.int(0, 16), (generator) =>
      generator.bytes(generator.int(0, 32)),
    );
    const data = concatChunks(chunks);

    const { outputChunks, closeError } = await runEncodeStream(checksum, chunks, {
      [ChecksumSha256.CHECKSUM_VAR_NAME]: toHex(sha256(data)),
    });

    expect(closeError).toBeUndefined();
    expect(toHex(concatChunks(outputChunks))).toBe(toHex(data));
  });
});

test("期待値が実際のダイジェストと異なれば必ず ChecksumMismatchError になる", async ({
  expect,
}) => {
  // 準備
  const checksum = new ChecksumSha256();

  // 実行と検証
  await forCasesAsync(12345, 50, async (random) => {
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
    expect((thrown as ChecksumMismatchError).meta).toStrictEqual({ actual, expected });
  });
});

test("全 6 アルゴリズムでランダムデータのダイジェスト検証に成功する", async ({ expect }) => {
  // 実行と検証
  await forCasesAsync(67890, 50, async (random) => {
    const algorithm = random.pick(ALGORITHMS);
    const data = random.bytes(random.int(0, 128));

    const result = await encode(algorithm.create(), data, {
      [algorithm.varName]: algorithm.digestOf(data),
    });

    expect(result).toBe(data);
  });
});
