import { createPseudoRandomBytes } from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

// oxlint-disable unicorn/number-literal-case
import Compression from "../src/compression.js";
import { decode, encode, FORMATS } from "./helpers.js";

/**
 * 値が undefined でないことを表明して取り出します。
 */
function unwrap<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("想定外の undefined です。");
  }

  return value;
}

/**
 * 形式ごとの判定に使う代表的な入力データを作成します。
 */
function createInput(): Uint8Array<ArrayBuffer> {
  return createPseudoRandomBytes(512, 7);
}

describe("gzip 形式", () => {
  test("encode したデータは gzip のマジックバイトで始まる", async ({ expect }) => {
    // 準備：
    const compression = new Compression("gzip");

    // 実行：
    const encoded = await encode(compression, createInput());

    // 検証：
    expect(Array.from(encoded.subarray(0, 3))).toStrictEqual([0x1f, 0x8b, 0x08]);
  });
});

describe("deflate 形式", () => {
  test("encode したデータは zlib ヘッダーで始まる", async ({ expect }) => {
    // 準備：
    const compression = new Compression("deflate");

    // 実行：
    const encoded = await encode(compression, createInput());
    const first = encoded[0];
    const second = encoded[1];

    // oxlint-disable-next-line vitest/no-conditional-in-test -- ポーリング／後始末の条件分岐はテストの進行に必須のため、使用します。
    if (first === undefined || second === undefined) {
      throw new Error("エンコード結果が存在しません。");
    }

    // 検証：
    const compressionMethod = first & 0x0f;
    const header = (first << 8) | second;
    expect(compressionMethod).toBe(0x08);
    expect(header % 31).toBe(0);
  });
});

describe("deflate-raw 形式", () => {
  test("encode したデータは gzip のマジックバイトで始まらない", async ({ expect }) => {
    // 準備：
    const compression = new Compression("deflate-raw");

    // 実行：
    const encoded = await encode(compression, createInput());

    // 検証：
    expect(Array.from(encoded.subarray(0, 2))).not.toStrictEqual([0x1f, 0x8b]);
  });

  test("encode したデータは zlib ヘッダーで始まらない", async ({ expect }) => {
    // 準備：
    const compression = new Compression("deflate-raw");

    // 実行：
    const encoded = await encode(compression, createInput());
    const first = encoded[0];
    const second = encoded[1];

    // oxlint-disable-next-line vitest/no-conditional-in-test -- ポーリング／後始末の条件分岐はテストの進行に必須のため、使用します。
    if (first === undefined || second === undefined) {
      throw new Error("エンコード結果が存在しません。");
    }

    // 検証：
    // oxlint-disable-next-line vitest/no-conditional-in-test -- ポーリング／後始末の条件分岐はテストの進行に必須のため、使用します。
    const hasZlibHeader = (first & 0x0f) === 0x08 && ((first << 8) | second) % 31 === 0;
    expect(hasZlibHeader).toBe(false);
  });
});

describe("形式の混在", () => {
  test("異なる形式で圧縮したデータを decode すると拒否される", async ({ expect }) => {
    // 準備：
    const input = createInput();
    const encodedList = await Promise.all(
      FORMATS.map((format) => encode(new Compression(format), input)),
    );

    // 実行と検証：
    for (const [sourceIndex, source] of FORMATS.entries()) {
      for (const [targetIndex, target] of FORMATS.entries()) {
        // oxlint-disable-next-line vitest/no-conditional-in-test -- ポーリング／後始末の条件分岐はテストの進行に必須のため、使用します。
        if (sourceIndex === targetIndex) {
          continue;
        }

        const encoded = encodedList[sourceIndex];

        const compression = new Compression(target);
        await expect(
          decode(compression, unwrap(encoded)),
          `${source} -> ${target}`,
        ).rejects.toThrow(Error);
      }
    }
  });
});
