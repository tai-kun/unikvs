import { test } from "vitest";

import PassThrough from "../src/passthrough.js";
import { collectChunks } from "./_helpers.js";
import { forCases, forCasesAsync, type Random } from "./_random.js";

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

test("ランダムな値でも encode は同一参照を返す", ({ expect }) => {
  // 準備
  const passthrough = new PassThrough();

  // 実行と検証
  forCases(SEED, 100, (random) => {
    const value = generateValue(random);

    expect(passthrough.encode({ data: value })).toBe(value);
  });
});

test("ランダムな値でも decode は同一参照を返す", ({ expect }) => {
  // 準備
  const passthrough = new PassThrough();

  // 実行と検証
  forCases(SEED, 100, (random) => {
    const value = generateValue(random);

    expect(passthrough.decode({ data: value })).toBe(value);
  });
});

test("ランダムなチャンク列でも getEncodable は順序と参照を保つ", async ({ expect }) => {
  // 準備
  const passthrough = new PassThrough();

  // 実行と検証
  await forCasesAsync(SEED, 50, async (random) => {
    const chunks = random.array(random.uint(50), () => generateValue(random));
    const output = await collectChunks(passthrough.getEncodable(), chunks);

    expect(output).toHaveLength(chunks.length);

    for (const [index, chunk] of output.entries()) {
      expect(chunk).toBe(chunks[index]);
    }
  });
});

test("ランダムなチャンク列でも getDecodable は順序と参照を保つ", async ({ expect }) => {
  // 準備
  const passthrough = new PassThrough();

  // 実行と検証
  await forCasesAsync(SEED, 50, async (random) => {
    const chunks = random.array(random.uint(50), () => generateValue(random));
    const output = await collectChunks(passthrough.getDecodable(), chunks);

    expect(output).toHaveLength(chunks.length);

    for (const [index, chunk] of output.entries()) {
      expect(chunk).toBe(chunks[index]);
    }
  });
});
