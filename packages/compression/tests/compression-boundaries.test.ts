import { describe, test as vitest } from "vitest";

import Compression from "../src/compression.js";
import { FORMATS, bytesEqual, createPseudoRandomBytes } from "./helpers.js";

/**
 * 境界サイズと特殊パターンの入力データをまとめて生成します。
 * 1 MiB など再生成コストのあるデータをファイル内で共有するために使用します。
 */
function createBoundaryInputs(): ReadonlyMap<string, Uint8Array<ArrayBuffer>> {
  return new Map<string, Uint8Array<ArrayBuffer>>([
    ["0 バイト", new Uint8Array(0)],
    ["1 バイト (0x00)", new Uint8Array([0x00])],
    ["1 バイト (0xff)", new Uint8Array([0xff])],
    ["2 バイト (0x00 0xff)", new Uint8Array([0x00, 0xff])],
    ["内部に 0x00 を含むバイナリ", new Uint8Array([0xde, 0xad, 0x00, 0xbe, 0xef])],
    ["255 バイト", createPseudoRandomBytes(255, 1)],
    ["256 バイト", createPseudoRandomBytes(256, 2)],
    ["1 KiB", createPseudoRandomBytes(1024, 3)],
    ["すべて 0 の 1 KiB", new Uint8Array(1024)],
    ["すべて 0xff の 1 KiB", new Uint8Array(1024).fill(0xff)],
  ]);
}

const test = vitest.extend<{
  boundaryInputs: ReadonlyMap<string, Uint8Array<ArrayBuffer>>;
}>({
  boundaryInputs: [
    // oxlint-disable-next-line no-empty-pattern
    async ({}, use) => {
      await use(createBoundaryInputs());
    },
    { scope: "file" },
  ],
});

describe("境界サイズと特殊パターンの往復", () => {
  describe.each(FORMATS)("%s 形式", (format) => {
    test("0 バイトから 1 KiB までの入力で元のデータに戻る", async ({ boundaryInputs, expect }) => {
      // 準備
      const compression = new Compression(format);

      // 実行と検証
      for (const [label, input] of boundaryInputs) {
        const encoded = await compression.encode({ data: input });
        const decoded = await compression.decode({ data: encoded });
        expect(decoded, `${format}: ${label}`).toStrictEqual(input);
      }
    });
  });

  test("1 MiB のランダムデータを deflate / deflate-raw で往復しても元のデータに戻る", async ({
    expect,
  }) => {
    // 準備
    const input = createPseudoRandomBytes(1024 * 1024, 4);

    // 実行と検証
    for (const format of ["deflate", "deflate-raw"] as const) {
      const compression = new Compression(format);
      const encoded = await compression.encode({ data: input });
      const decoded = await compression.decode({ data: encoded });
      expect(bytesEqual(decoded, input), format).toBe(true);
    }
  }, 30_000);

  test("4 MiB の反復データを各形式で往復しても元のデータに戻る", async ({ expect }) => {
    // 準備
    const input = new TextEncoder().encode("0123456789abcdef".repeat((4 * 1024 * 1024) / 16));

    // 実行と検証
    for (const format of FORMATS) {
      const compression = new Compression(format);
      const encoded = await compression.encode({ data: input });
      const decoded = await compression.decode({ data: encoded });
      expect(bytesEqual(decoded, input), format).toBe(true);
    }
  }, 30_000);
});

describe("圧縮率の健全性", () => {
  test("反復データを deflate / deflate-raw で圧縮しても元のデータより大きくならない", async ({
    expect,
  }) => {
    // 準備
    const input = new TextEncoder().encode(
      "Repeat this text multiple times to ensure compression efficiency. ".repeat(100),
    );

    // 実行と検証
    for (const format of ["deflate", "deflate-raw"] as const) {
      const compression = new Compression(format);
      const encoded = await compression.encode({ data: input });
      expect(encoded.length, format).toBeLessThan(input.length);
    }
  });
});
