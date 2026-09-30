import { createHash } from "node:crypto";

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
import { concatChunks, runTransform, splitBySizes, toHex } from "./_helpers.js";
import { forCases, forCasesAsync } from "./_random.js";

const ALGORITHMS = [
  {
    label: "MD5",
    nodeName: "md5",
    varName: "@unikvs/checksum:md5",
    create: (options?: ChecksumOptions) => new ChecksumMd5(options),
  },
  {
    label: "SHA-1",
    nodeName: "sha1",
    varName: "@unikvs/checksum:sha1",
    create: (options?: ChecksumOptions) => new ChecksumSha1(options),
  },
  {
    label: "SHA-224",
    nodeName: "sha224",
    varName: "@unikvs/checksum:sha224",
    create: (options?: ChecksumOptions) => new ChecksumSha224(options),
  },
  {
    label: "SHA-256",
    nodeName: "sha256",
    varName: "@unikvs/checksum:sha256",
    create: (options?: ChecksumOptions) => new ChecksumSha256(options),
  },
  {
    label: "SHA-384",
    nodeName: "sha384",
    varName: "@unikvs/checksum:sha384",
    create: (options?: ChecksumOptions) => new ChecksumSha384(options),
  },
  {
    label: "SHA-512",
    nodeName: "sha512",
    varName: "@unikvs/checksum:sha512",
    create: (options?: ChecksumOptions) => new ChecksumSha512(options),
  },
] as const;

const FIXED_INPUTS = [
  Uint8Array.from(new TextEncoder().encode("abc")),
  Uint8Array.from(new TextEncoder().encode("日本語テキスト🎉")),
  new Uint8Array(0),
];

const LARGE_DATA = new Uint8Array(1024 * 1024);
for (let index = 0; index < LARGE_DATA.length; index += 1) {
  LARGE_DATA[index] = (index * 31) % 256;
}

/**
 * node:crypto の createHash で計算した 16 進ダイジェストを返します。
 * パッケージの実装から独立した期待値を作るために使用します。
 */
function nodeDigest(algorithm: string, data: Uint8Array): string {
  return createHash(algorithm).update(data).digest("hex");
}

test.for(ALGORITHMS)(
  "$label は固定入力で node:crypto と同じダイジェストを検証する",
  ({ create, nodeName, varName }, { expect }) => {
    // 準備
    const checksum = create();

    // 実行と検証
    for (const data of FIXED_INPUTS) {
      const vars = { [varName]: nodeDigest(nodeName, data) };
      expect(checksum.encode({ vars, data })).toBe(data);
    }
  },
);

test.for(ALGORITHMS)(
  "$label は 1 MiB のデータでも node:crypto と同じダイジェストを検証する",
  ({ create, nodeName, varName }, { expect }) => {
    // 準備
    const checksum = create();
    const vars = { [varName]: nodeDigest(nodeName, LARGE_DATA) };

    // 実行
    const result = checksum.encode({ vars, data: LARGE_DATA });

    // 検証
    expect(result).toBe(LARGE_DATA);
  },
);

test.for(ALGORITHMS)(
  "$label は 1 MiB のストリームでも node:crypto と同じダイジェストを検証する",
  async ({ create, nodeName, varName }, { expect }) => {
    // 準備
    const checksum = create();
    const vars = { [varName]: nodeDigest(nodeName, LARGE_DATA) };
    const chunks = [LARGE_DATA.subarray(0, 500_000), LARGE_DATA.subarray(500_000)];

    // 実行
    const { outputChunks, closeError } = await runTransform(
      checksum.getEncodable({ vars }),
      chunks,
    );

    // 検証
    expect(closeError).toBeUndefined();
    expect(toHex(concatChunks(outputChunks))).toBe(toHex(LARGE_DATA));
  },
);

test("ランダムなデータとチャンク分割でもストリーム検証が node:crypto と一致する", async ({
  expect,
}) => {
  // 実行と検証
  await forCasesAsync(20240101, 60, async (random) => {
    const algorithm = random.pick(ALGORITHMS);
    const data = random.bytes(random.int(0, 512));
    const sizes = random.array(random.int(0, 12), (generator) => generator.int(1, 64));
    const chunks = splitBySizes(data, sizes);
    const vars = { [algorithm.varName]: nodeDigest(algorithm.nodeName, data) };

    const { outputChunks, closeError } = await runTransform(
      algorithm.create().getEncodable({ vars }),
      chunks,
    );

    expect(closeError).toBeUndefined();
    expect(toHex(concatChunks(outputChunks))).toBe(toHex(data));
  });
});

test("不一致時の meta.actual が node:crypto のダイジェストと一致する", ({ expect }) => {
  // 実行と検証
  forCases(20240202, 50, (random) => {
    const algorithm = random.pick(ALGORITHMS);
    const data = random.bytes(random.int(0, 256));
    const actual = nodeDigest(algorithm.nodeName, data);
    const expected = "0".repeat(actual.length + 1);

    let thrown: unknown;
    try {
      algorithm.create().encode({ vars: { [algorithm.varName]: expected }, data });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ChecksumMismatchError);
    expect((thrown as ChecksumMismatchError).meta).toStrictEqual({ actual, expected });
  });
});
