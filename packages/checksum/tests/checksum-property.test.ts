import { md5, sha1 } from "@noble/hashes/legacy.js";
import { sha224, sha256, sha384, sha512 } from "@noble/hashes/sha2.js";
import { test } from "vitest";

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
import { concatChunks, runTransform, toHex } from "./_helpers.js";
import { forCases, forCasesAsync } from "./_random.js";

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

test("ランダムなチャンク分割でもストリーム検証が一括検証と同じ結果になる", async ({ expect }) => {
  // 準備
  const checksum = new ChecksumSha256();

  // 実行と検証
  await forCasesAsync(20240930, 100, async (random) => {
    const chunks = random.array(random.int(0, 16), (generator) =>
      generator.bytes(generator.int(0, 32)),
    );
    const data = concatChunks(chunks);
    const vars = { [ChecksumSha256.CHECKSUM_VAR_NAME]: toHex(sha256(data)) };

    const { outputChunks, closeError } = await runTransform(
      checksum.getEncodable({ vars }),
      chunks,
    );

    expect(closeError).toBeUndefined();
    expect(toHex(concatChunks(outputChunks))).toBe(toHex(data));
  });
});

test("期待値が実際のダイジェストと異なれば必ず ChecksumMismatchError になる", ({ expect }) => {
  // 準備
  const checksum = new ChecksumSha256();

  // 実行と検証
  forCases(12345, 50, (random) => {
    const data = random.bytes(random.int(0, 256));
    const actual = toHex(sha256(data));
    const expected = `${actual}0`;
    const vars = { [ChecksumSha256.CHECKSUM_VAR_NAME]: expected };

    let thrown: unknown;
    try {
      checksum.encode({ vars, data });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ChecksumMismatchError);
    expect((thrown as ChecksumMismatchError).meta).toStrictEqual({ actual, expected });
  });
});

test("全 6 アルゴリズムでランダムデータのダイジェスト検証に成功する", ({ expect }) => {
  // 実行と検証
  forCases(67890, 50, (random) => {
    const algorithm = random.pick(ALGORITHMS);
    const data = random.bytes(random.int(0, 128));
    const vars = { [algorithm.varName]: algorithm.digestOf(data) };

    const result = algorithm.create().encode({ vars, data });

    expect(result).toBe(data);
  });
});
