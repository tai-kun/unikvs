import { createHash } from "node:crypto";

import type { IMiddleware } from "@unikvs/core";
import {
  concatChunks,
  createEncodeContext,
  createEncodeStreamContext,
  createNext,
  sourceFrom,
  splitBySizes,
  toHex,
} from "@unikvs/testing";
import { forCasesAsync } from "@unikvs/testing";
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
import type Checksum from "../src/checksum.js";

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

test.for(ALGORITHMS)(
  "$label は固定入力で node:crypto と同じダイジェストを検証する",
  async ({ create, nodeName, varName }, { expect }) => {
    // 準備
    const checksum = create();

    // 実行と検証
    for (const data of FIXED_INPUTS) {
      expect(await encode(checksum, data, { [varName]: nodeDigest(nodeName, data) })).toBe(data);
    }
  },
);

test.for(ALGORITHMS)(
  "$label は 1 MiB のデータでも node:crypto と同じダイジェストを検証する",
  async ({ create, nodeName, varName }, { expect }) => {
    // 準備
    const checksum = create();

    // 実行
    const result = await encode(checksum, LARGE_DATA, {
      [varName]: nodeDigest(nodeName, LARGE_DATA),
    });

    // 検証
    expect(result).toBe(LARGE_DATA);
  },
);

test.for(ALGORITHMS)(
  "$label は 1 MiB のストリームでも node:crypto と同じダイジェストを検証する",
  async ({ create, nodeName, varName }, { expect }) => {
    // 準備
    const checksum = create();
    const chunks = [LARGE_DATA.subarray(0, 500_000), LARGE_DATA.subarray(500_000)];

    // 実行
    const { outputChunks, closeError } = await runEncodeStream(checksum, chunks, {
      [varName]: nodeDigest(nodeName, LARGE_DATA),
    });

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

    const { outputChunks, closeError } = await runEncodeStream(algorithm.create(), chunks, {
      [algorithm.varName]: nodeDigest(algorithm.nodeName, data),
    });

    expect(closeError).toBeUndefined();
    expect(toHex(concatChunks(outputChunks))).toBe(toHex(data));
  });
});

test("不一致時の meta.actual が node:crypto のダイジェストと一致する", async ({ expect }) => {
  // 実行と検証
  await forCasesAsync(20240202, 50, async (random) => {
    const algorithm = random.pick(ALGORITHMS);
    const data = random.bytes(random.int(0, 256));
    const actual = nodeDigest(algorithm.nodeName, data);
    const expected = "0".repeat(actual.length + 1);

    let thrown: unknown;
    try {
      await encode(algorithm.create(), data, { [algorithm.varName]: expected });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ChecksumMismatchError);
    expect((thrown as ChecksumMismatchError).meta).toStrictEqual({ actual, expected });
  });
});
