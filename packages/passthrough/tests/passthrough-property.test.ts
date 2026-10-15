import type { IMiddleware } from "@unikvs/core";
import { forCasesAsync, type Random } from "@unikvs/testing";
import {
  createDecodeContext,
  createDecodeStreamContext,
  createEncodeContext,
  createEncodeStreamContext,
  createNext,
  readAll,
  sourceFrom,
} from "@unikvs/testing";
import { test } from "vitest";

import PassThrough from "../src/passthrough.js";

const SEED = 20260930;

/**
 * 透過対象として任意の型の値を決定的に生成します。
 * 参照同一性の検証に使用するため、値オブジェクトや配列も含めます。
 */
function generateValue(random: Random): unknown {
  switch (random.int(0, 8)) {
    case 0: {
      return random.bytes(random.uint(32));
    }
    case 1: {
      return random.string(random.uint(32));
    }
    case 2: {
      return random.int(-1000, 1000);
    }
    case 3: {
      return BigInt(random.int(-1000, 1000));
    }
    case 4: {
      return random.bool();
    }
    case 5: {
      return null;
    }
    case 6: {
      return undefined;
    }
    case 7: {
      return random.array(random.uint(8), () => random.int(-1000, 1000));
    }
    default: {
      return { id: random.int(0, 100), name: random.string(random.uint(8)) };
    }
  }
}

/**
 * 値をエンコードして出力された値を返します。
 */
async function encode(passthrough: PassThrough, value: unknown): Promise<unknown> {
  const c = createEncodeContext(value);
  await passthrough.encode(c as IMiddleware.EncodeContext, createNext());

  return c.destination;
}

/**
 * 値をデコードして出力された値を返します。
 */
async function decode(passthrough: PassThrough, value: unknown): Promise<unknown> {
  const c = createDecodeContext(value);
  await passthrough.decode(c as IMiddleware.DecodeContext, createNext());

  return c.destination;
}

/**
 * チャンク列をエンコードストリームに流して出力されたチャンクを順に返します。
 */
async function encodeChunks(
  passthrough: PassThrough,
  chunks: readonly unknown[],
): Promise<unknown[]> {
  const c = createEncodeStreamContext(sourceFrom(chunks));
  await passthrough.encodeStream(c as IMiddleware.EncodeStreamContext, createNext());

  return readAll(c.destination);
}

/**
 * チャンク列をデコードストリームに流して出力されたチャンクを順に返します。
 */
async function decodeChunks(
  passthrough: PassThrough,
  chunks: readonly unknown[],
): Promise<unknown[]> {
  const c = createDecodeStreamContext(sourceFrom(chunks));
  await passthrough.decodeStream(c as IMiddleware.DecodeStreamContext, createNext());

  return readAll(c.destination);
}

test("ランダムな値でも encode は同一参照を返す", async ({ expect }) => {
  // 準備
  const passthrough = new PassThrough();

  // 実行と検証
  await forCasesAsync(SEED, 100, async (random) => {
    const value = generateValue(random);

    expect(await encode(passthrough, value)).toBe(value);
  });
});

test("ランダムな値でも decode は同一参照を返す", async ({ expect }) => {
  // 準備
  const passthrough = new PassThrough();

  // 実行と検証
  await forCasesAsync(SEED, 100, async (random) => {
    const value = generateValue(random);

    expect(await decode(passthrough, value)).toBe(value);
  });
});

test("ランダムなチャンク列でも encodeStream は順序と参照を保つ", async ({ expect }) => {
  // 準備
  const passthrough = new PassThrough();

  // 実行と検証
  await forCasesAsync(SEED, 50, async (random) => {
    const chunks = random.array(random.uint(50), () => generateValue(random));
    const output = await encodeChunks(passthrough, chunks);

    expect(output).toHaveLength(chunks.length);

    for (const [index, chunk] of output.entries()) {
      expect(chunk).toBe(chunks[index]);
    }
  });
});

test("ランダムなチャンク列でも decodeStream は順序と参照を保つ", async ({ expect }) => {
  // 準備
  const passthrough = new PassThrough();

  // 実行と検証
  await forCasesAsync(SEED, 50, async (random) => {
    const chunks = random.array(random.uint(50), () => generateValue(random));
    const output = await decodeChunks(passthrough, chunks);

    expect(output).toHaveLength(chunks.length);

    for (const [index, chunk] of output.entries()) {
      expect(chunk).toBe(chunks[index]);
    }
  });
});
