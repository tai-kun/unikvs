import type { IMiddleware } from "@unikvs/core";
import {
  createDecodeContext,
  createEncodeContext,
  createNext,
  createPseudoRandomBytes,
} from "@unikvs/testing";
import { describe, test } from "vitest";

import Compression from "../src/compression.js";
import { FORMATS } from "./helpers.js";

/**
 * バイト列を圧縮して返します。
 */
async function encode(
  compression: Compression,
  data: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const c = createEncodeContext(data);
  await compression.encode(
    c as IMiddleware.EncodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
    createNext(),
  );

  return c.destination;
}

/**
 * 圧縮されたバイト列を展開して返します。
 */
async function decode(
  compression: Compression,
  data: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const c = createDecodeContext(data);
  await compression.decode(
    c as IMiddleware.DecodeContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
    createNext(),
  );

  return c.destination;
}

/**
 * 形式ごとの判定に使う代表的な入力データを作成します。
 */
function createInput(): Uint8Array<ArrayBuffer> {
  return createPseudoRandomBytes(512, 7);
}

describe("gzip 形式", () => {
  test("encode したデータは gzip のマジックバイトで始まる", async ({ expect }) => {
    // 準備
    const compression = new Compression("gzip");

    // 実行
    const encoded = await encode(compression, createInput());

    // 検証
    expect(Array.from(encoded.subarray(0, 3))).toStrictEqual([0x1f, 0x8b, 0x08]);
  });
});

describe("deflate 形式", () => {
  test("encode したデータは zlib ヘッダーで始まる", async ({ expect }) => {
    // 準備
    const compression = new Compression("deflate");

    // 実行
    const encoded = await encode(compression, createInput());

    // 検証
    const compressionMethod = encoded[0]! & 0x0f;
    const header = (encoded[0]! << 8) | encoded[1]!;
    expect(compressionMethod).toBe(0x08);
    expect(header % 31).toBe(0);
  });
});

describe("deflate-raw 形式", () => {
  test("encode したデータは gzip のマジックバイトで始まらない", async ({ expect }) => {
    // 準備
    const compression = new Compression("deflate-raw");

    // 実行
    const encoded = await encode(compression, createInput());

    // 検証
    expect(Array.from(encoded.subarray(0, 2))).not.toStrictEqual([0x1f, 0x8b]);
  });

  test("encode したデータは zlib ヘッダーで始まらない", async ({ expect }) => {
    // 準備
    const compression = new Compression("deflate-raw");

    // 実行
    const encoded = await encode(compression, createInput());

    // 検証
    const hasZlibHeader =
      (encoded[0]! & 0x0f) === 0x08 && ((encoded[0]! << 8) | encoded[1]!) % 31 === 0;
    expect(hasZlibHeader).toBe(false);
  });
});

describe("形式の混在", () => {
  test("異なる形式で圧縮したデータを decode すると拒否される", async ({ expect }) => {
    // 準備
    const input = createInput();
    const encodedList = await Promise.all(
      FORMATS.map((format) => encode(new Compression(format), input)),
    );

    // 実行と検証
    for (const [sourceIndex, source] of FORMATS.entries()) {
      for (const [targetIndex, target] of FORMATS.entries()) {
        if (sourceIndex === targetIndex) continue;
        const compression = new Compression(target);
        await expect(
          decode(compression, encodedList[sourceIndex]!),
          `${source} -> ${target}`,
        ).rejects.toThrow(Error);
      }
    }
  });
});
