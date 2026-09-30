import { test } from "vitest";

import {
  type ChecksumOptions,
  ChecksumMd5,
  ChecksumMismatchError,
  ChecksumSha1,
  ChecksumSha256,
  ChecksumSha384,
  ChecksumSha512,
} from "../src/index.js";
import { concatChunks, runTransform, splitBySizes, toHex } from "./_helpers.js";
import { forCasesAsync } from "./_random.js";

const SUBTLE_ALGORITHMS = [
  {
    label: "SHA-1",
    subtleName: "SHA-1",
    varName: "@unikvs/checksum:sha1",
    create: (options?: ChecksumOptions) => new ChecksumSha1(options),
  },
  {
    label: "SHA-256",
    subtleName: "SHA-256",
    varName: "@unikvs/checksum:sha256",
    create: (options?: ChecksumOptions) => new ChecksumSha256(options),
  },
  {
    label: "SHA-384",
    subtleName: "SHA-384",
    varName: "@unikvs/checksum:sha384",
    create: (options?: ChecksumOptions) => new ChecksumSha384(options),
  },
  {
    label: "SHA-512",
    subtleName: "SHA-512",
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
 * WebCrypto の SubtleCrypto.digest で計算した 16 進ダイジェストを返します。
 * ブラウザー標準の実装とパッケージの実装を突き合わせるために使用します。
 */
async function subtleDigest(algorithm: string, data: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest(algorithm, data);
  return toHex(new Uint8Array(digest));
}

test.for(SUBTLE_ALGORITHMS)(
  "$label は固定入力で WebCrypto と同じダイジェストを検証する",
  async ({ create, subtleName, varName }, { expect }) => {
    // 準備
    const checksum = create();

    // 実行と検証
    for (const data of FIXED_INPUTS) {
      const vars = { [varName]: await subtleDigest(subtleName, data) };
      expect(checksum.encode({ vars, data })).toBe(data);
    }
  },
);

test.for(SUBTLE_ALGORITHMS)(
  "$label は 1 MiB のストリームでも WebCrypto と同じダイジェストを検証する",
  async ({ create, subtleName, varName }, { expect }) => {
    // 準備
    const checksum = create();
    const vars = { [varName]: await subtleDigest(subtleName, LARGE_DATA) };
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

test("SHA-256 はランダムなデータとチャンク分割でも WebCrypto と一致する", async ({ expect }) => {
  // 準備
  const checksum = new ChecksumSha256();

  // 実行と検証
  await forCasesAsync(20240303, 50, async (random) => {
    const data = random.bytes(random.int(0, 512));
    const sizes = random.array(random.int(0, 12), (generator) => generator.int(1, 64));
    const chunks = splitBySizes(data, sizes);
    const vars = { [ChecksumSha256.CHECKSUM_VAR_NAME]: await subtleDigest("SHA-256", data) };

    const { outputChunks, closeError } = await runTransform(
      checksum.getEncodable({ vars }),
      chunks,
    );

    expect(closeError).toBeUndefined();
    expect(toHex(concatChunks(outputChunks))).toBe(toHex(data));
  });
});

test("MD5 は既知のベクターを検証できる", ({ expect }) => {
  // 準備
  const checksum = new ChecksumMd5();
  const vectors = [
    ["abc", "900150983cd24fb0d6963f7d28e17f72"],
    ["日本語テキスト🎉", "af91e7698b2586a0dba9c8d6a44d1d4d"],
  ] as const;

  // 実行と検証
  for (const [text, digest] of vectors) {
    const data = Uint8Array.from(new TextEncoder().encode(text));
    const vars = { [ChecksumMd5.CHECKSUM_VAR_NAME]: digest };
    expect(checksum.encode({ vars, data })).toBe(data);
  }
});

test("MD5 はランダムなデータでも一括検証とストリーム検証が同じダイジェストになる", async ({
  expect,
}) => {
  // 準備
  const checksum = new ChecksumMd5();

  // 実行と検証
  await forCasesAsync(20240404, 50, async (random) => {
    const data = random.bytes(random.int(0, 256));
    let actual = "";
    try {
      checksum.encode({ vars: { [ChecksumMd5.CHECKSUM_VAR_NAME]: "" }, data });
    } catch (error) {
      actual = (error as ChecksumMismatchError).meta.actual;
    }

    const { closeError } = await runTransform(
      checksum.getEncodable({ vars: { [ChecksumMd5.CHECKSUM_VAR_NAME]: actual } }),
      [data],
    );

    expect(actual).not.toBe("");
    expect(closeError).toBeUndefined();
  });
});
