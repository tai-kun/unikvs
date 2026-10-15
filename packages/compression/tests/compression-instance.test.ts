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

describe("インスタンスの状態", () => {
  test("encode と decode の後も name と isOpen は変化しない", async ({ expect }) => {
    // 準備
    const compression = new Compression("gzip");
    const input = createPseudoRandomBytes(128, 31);

    // 実行
    const encoded = await encode(compression, input);
    await decode(compression, encoded);

    // 検証
    expect(compression.name).toBe("Compression");
    expect(compression.isOpen).toBe(true);
  });

  test("decode が失敗しても isOpen は true のままである", async ({ expect }) => {
    // 準備
    const compression = new Compression("gzip");
    const invalidData = new Uint8Array([0, 1, 2, 3]);

    // 実行と検証
    await expect(decode(compression, invalidData)).rejects.toThrow(Error);
    expect(compression.isOpen).toBe(true);
  });
});

describe("インスタンスの独立性", () => {
  test("異なる形式の複数インスタンスを同時に使っても互いに影響しない", async ({ expect }) => {
    // 準備
    const instances = FORMATS.map((format) => new Compression(format));
    const input = createPseudoRandomBytes(2048, 32);

    // 実行
    const decodedList = await Promise.all(
      instances.map(async (compression) => decode(compression, await encode(compression, input))),
    );

    // 検証
    for (const [index, decoded] of decodedList.entries()) {
      expect(decoded, FORMATS[index]).toStrictEqual(input);
    }

    for (const compression of instances) {
      expect(compression.name).toBe("Compression");
      expect(compression.isOpen).toBe(true);
    }
  });
});

describe("入力データの非破壊性", () => {
  test("encode と decode は引数の data を変更しない", async ({ expect }) => {
    // 準備
    const compression = new Compression("gzip");
    const input = createPseudoRandomBytes(1024, 33);
    const inputSnapshot = input.slice();

    // 実行
    const encoded = await encode(compression, input);
    const encodedSnapshot = encoded.slice();
    const decoded = await decode(compression, encoded);

    // 検証
    expect(input).toStrictEqual(inputSnapshot);
    expect(encoded).toStrictEqual(encodedSnapshot);
    expect(decoded).toStrictEqual(input);
  });
});
