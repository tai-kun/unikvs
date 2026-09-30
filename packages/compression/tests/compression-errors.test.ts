import { describe, test } from "vitest";

import Compression from "../src/compression.js";
import { FORMATS, createPseudoRandomBytes, pumpThrough } from "./helpers.js";

const INVALID_FORMATS = ["unknown-format", "zstd", ""] as const;

describe("不正なフォーマット", () => {
  test("getEncodable と getDecodable は TypeError を投げる", ({ expect }) => {
    // 準備
    for (const format of INVALID_FORMATS) {
      const compression = new Compression(format as never);

      // 実行と検証
      expect(() => compression.getEncodable(), format).toThrow(TypeError);
      expect(() => compression.getDecodable(), format).toThrow(TypeError);
    }
  });

  test("encode と decode は TypeError で拒否される", async ({ expect }) => {
    // 準備
    const input = createPseudoRandomBytes(16, 21);

    for (const format of INVALID_FORMATS) {
      const compression = new Compression(format as never);

      // 実行と検証
      await expect(compression.encode({ data: input }), format).rejects.toThrow(TypeError);
      await expect(compression.decode({ data: input }), format).rejects.toThrow(TypeError);
    }
  });
});

describe("壊れた圧縮データの decode", () => {
  test("空のバイト列はすべての形式で拒否される", async ({ expect }) => {
    // 準備
    const empty = new Uint8Array(0);

    // 実行と検証
    for (const format of FORMATS) {
      const compression = new Compression(format);
      await expect(compression.decode({ data: empty }), format).rejects.toThrow(Error);
    }
  });

  describe("gzip", () => {
    test("圧縮データではないバイト列を拒否する", async ({ expect }) => {
      // 準備
      const compression = new Compression("gzip");
      const garbage = createPseudoRandomBytes(64, 22);

      // 実行と検証
      await expect(compression.decode({ data: garbage })).rejects.toThrow(Error);
    });

    test("末尾を欠いたデータを拒否する", async ({ expect }) => {
      // 準備
      const compression = new Compression("gzip");
      const encoded = await compression.encode({ data: createPseudoRandomBytes(4096, 23) });

      // 実行と検証
      await expect(
        compression.decode({ data: encoded.subarray(0, encoded.length - 4) }),
      ).rejects.toThrow(Error);
    });

    test("CRC を壊したデータを拒否する", async ({ expect }) => {
      // 準備
      const compression = new Compression("gzip");
      const encoded = await compression.encode({ data: createPseudoRandomBytes(4096, 24) });
      const corrupted = encoded.slice();
      const lastIndex = corrupted.length - 1;
      corrupted[lastIndex] = corrupted[lastIndex]! ^ 0xff;

      // 実行と検証
      await expect(compression.decode({ data: corrupted })).rejects.toThrow(Error);
    });
  });

  describe("deflate", () => {
    test("圧縮データではないバイト列を拒否する", async ({ expect }) => {
      // 準備
      const compression = new Compression("deflate");
      const garbage = createPseudoRandomBytes(64, 25);

      // 実行と検証
      await expect(compression.decode({ data: garbage })).rejects.toThrow(Error);
    });

    test("末尾を欠いたデータを拒否する", async ({ expect }) => {
      // 準備
      const compression = new Compression("deflate");
      const encoded = await compression.encode({ data: createPseudoRandomBytes(4096, 26) });

      // 実行と検証
      await expect(
        compression.decode({ data: encoded.subarray(0, encoded.length - 4) }),
      ).rejects.toThrow(Error);
    });

    test("Adler-32 チェックサムを壊したデータを拒否する", async ({ expect }) => {
      // 準備
      const compression = new Compression("deflate");
      const encoded = await compression.encode({ data: createPseudoRandomBytes(4096, 27) });
      const corrupted = encoded.slice();
      const lastIndex = corrupted.length - 1;
      corrupted[lastIndex] = corrupted[lastIndex]! ^ 0xff;

      // 実行と検証
      await expect(compression.decode({ data: corrupted })).rejects.toThrow(Error);
    });
  });

  describe("deflate-raw", () => {
    test("末尾を欠いたデータを拒否する", async ({ expect }) => {
      // 準備
      // deflate-raw はチェックサムを持たずビット反転を検出できない場合があるため、切り詰めで検証する。
      const compression = new Compression("deflate-raw");
      const encoded = await compression.encode({ data: createPseudoRandomBytes(4096, 28) });

      // 実行と検証
      await expect(
        compression.decode({ data: encoded.subarray(0, encoded.length >> 1) }),
      ).rejects.toThrow(Error);
    });
  });
});

describe("ストリーム経由のエラー", () => {
  test("gzip として不正なデータを流すとエラーが観測される", async ({ expect }) => {
    // 準備
    const compression = new Compression("gzip");
    const garbage = createPseudoRandomBytes(64, 29);

    // 実行
    const decoded = await pumpThrough(compression.getDecodable(), [garbage]);

    // 検証
    expect(decoded.writeError ?? decoded.readError).toBeInstanceOf(Error);
  });

  test("切り詰めた gzip データを流すとエラーが観測される", async ({ expect }) => {
    // 準備
    const compression = new Compression("gzip");
    const encoded = await compression.encode({ data: createPseudoRandomBytes(4096, 30) });

    // 実行
    const decoded = await pumpThrough(compression.getDecodable(), [
      encoded.subarray(0, encoded.length - 4),
    ]);

    // 検証
    expect(decoded.writeError ?? decoded.readError).toBeInstanceOf(Error);
  });
});
