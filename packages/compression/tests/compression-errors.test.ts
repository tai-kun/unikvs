import type { IMiddleware } from "@unikvs/core";
import {
  createNext,
  sourceFrom,
  createDecodeContext,
  createEncodeContext,
  createPseudoRandomBytes,
  createDecodeStreamContext,
  createEncodeStreamContext,
} from "@unikvs/testing";
import { test, describe } from "vite-plus/test";

// oxlint-disable unicorn/number-literal-case
import Compression from "../src/compression.js";
import { FORMATS } from "./helpers.js";

const INVALID_FORMATS = ["unknown-format", "zstd", ""] as const;

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
 * 書き込み側と読み取り側のどちらかに現れたストリームエラーを返します。
 */
function getSettledError(settled: {
  readonly readError: unknown;
  readonly writeError: unknown;
}): unknown {
  return settled.writeError ?? settled.readError;
}

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
 * チャンク列を展開ストリームに流し、読み取り時のエラーを観測します。
 */
async function pumpDecode(
  compression: Compression,
  chunks: readonly Uint8Array<ArrayBuffer>[],
): Promise<{
  readError: unknown;
  writeError: undefined;
}> {
  const c = createDecodeStreamContext(sourceFrom(chunks));
  await compression.decodeStream(
    c as IMiddleware.DecodeStreamContext<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
    createNext(),
  );

  try {
    const reader = (c.destination as ReadableStream<Uint8Array<ArrayBuffer>>).getReader();

    for (;;) {
      const { done } = await reader.read();

      if (done) {
        break;
      }
    }

    return {
      readError: undefined,
      writeError: undefined,
    };
  } catch (ex) {
    return {
      readError: ex,
      writeError: undefined,
    };
  }
}

describe("不正なフォーマット", () => {
  test("encodeStream と decodeStream は TypeError で拒否される", async ({ expect }) => {
    // 準備：
    const input = [new Uint8Array([1, 2, 3])];

    for (const format of INVALID_FORMATS) {
      const compression = new Compression(format as never);

      // 実行と検証：
      const encodeContext = createEncodeStreamContext(sourceFrom(input));
      await expect(
        compression.encodeStream(
          encodeContext as IMiddleware.EncodeStreamContext<
            Uint8Array<ArrayBuffer>,
            Uint8Array<ArrayBuffer>
          >,
          createNext(),
        ),
        format,
      ).rejects.toThrow(TypeError);

      const decodeContext = createDecodeStreamContext(sourceFrom(input));
      await expect(
        compression.decodeStream(
          decodeContext as IMiddleware.DecodeStreamContext<
            Uint8Array<ArrayBuffer>,
            Uint8Array<ArrayBuffer>
          >,
          createNext(),
        ),
        format,
      ).rejects.toThrow(TypeError);
    }
  });

  test("encode と decode は TypeError で拒否される", async ({ expect }) => {
    // 準備：
    const input = createPseudoRandomBytes(16, 21);

    for (const format of INVALID_FORMATS) {
      const compression = new Compression(format as never);

      // 実行と検証：
      await expect(encode(compression, input), format).rejects.toThrow(TypeError);
      await expect(decode(compression, input), format).rejects.toThrow(TypeError);
    }
  });
});

describe("壊れた圧縮データの decode", () => {
  test("空のバイト列はすべての形式で拒否される", async ({ expect }) => {
    // 準備：
    const empty = new Uint8Array(0);

    // 実行と検証：
    for (const format of FORMATS) {
      const compression = new Compression(format);
      await expect(decode(compression, empty), format).rejects.toThrow(Error);
    }
  });

  describe("gzip", () => {
    test("圧縮データではないバイト列を拒否する", async ({ expect }) => {
      // 準備：
      const compression = new Compression("gzip");
      const garbage = createPseudoRandomBytes(64, 22);

      // 実行と検証：
      await expect(decode(compression, garbage)).rejects.toThrow(Error);
    });

    test("末尾を欠いたデータを拒否する", async ({ expect }) => {
      // 準備：
      const compression = new Compression("gzip");
      const encoded = await encode(compression, createPseudoRandomBytes(4096, 23));

      // 実行と検証：
      await expect(decode(compression, encoded.subarray(0, encoded.length - 4))).rejects.toThrow(
        Error,
      );
    });

    test("CRC を壊したデータを拒否する", async ({ expect }) => {
      // 準備：
      const compression = new Compression("gzip");
      const encoded = await encode(compression, createPseudoRandomBytes(4096, 24));
      const corrupted = encoded.slice();
      const lastIndex = corrupted.length - 1;
      const lastByte = corrupted[lastIndex];
      corrupted[lastIndex] = unwrap(lastByte) ^ 0xff;

      // 実行と検証：
      await expect(decode(compression, corrupted)).rejects.toThrow(Error);
    });
  });

  describe("deflate", () => {
    test("圧縮データではないバイト列を拒否する", async ({ expect }) => {
      // 準備：
      const compression = new Compression("deflate");
      const garbage = createPseudoRandomBytes(64, 25);

      // 実行と検証：
      await expect(decode(compression, garbage)).rejects.toThrow(Error);
    });

    test("末尾を欠いたデータを拒否する", async ({ expect }) => {
      // 準備：
      const compression = new Compression("deflate");
      const encoded = await encode(compression, createPseudoRandomBytes(4096, 26));

      // 実行と検証：
      await expect(decode(compression, encoded.subarray(0, encoded.length - 4))).rejects.toThrow(
        Error,
      );
    });

    test("Adler-32 チェックサムを壊したデータを拒否する", async ({ expect }) => {
      // 準備：
      const compression = new Compression("deflate");
      const encoded = await encode(compression, createPseudoRandomBytes(4096, 27));
      const corrupted = encoded.slice();
      const lastIndex = corrupted.length - 1;
      const lastByte = corrupted[lastIndex];
      corrupted[lastIndex] = unwrap(lastByte) ^ 0xff;

      // 実行と検証：
      await expect(decode(compression, corrupted)).rejects.toThrow(Error);
    });
  });

  describe("deflate-raw", () => {
    test("末尾を欠いたデータを拒否する", async ({ expect }) => {
      // 準備：
      // deflate-raw はチェックサムを持たずビット反転を検出できない場合があるため、切り詰めで検証する。
      const compression = new Compression("deflate-raw");
      const encoded = await encode(compression, createPseudoRandomBytes(4096, 28));

      // 実行と検証：
      await expect(decode(compression, encoded.subarray(0, encoded.length >> 1))).rejects.toThrow(
        Error,
      );
    });
  });
});

describe("ストリーム経由のエラー", () => {
  test("gzip として不正なデータを流すとエラーが観測される", async ({ expect }) => {
    // 準備：
    const compression = new Compression("gzip");
    const garbage = createPseudoRandomBytes(64, 29);

    // 実行：
    const decoded = await pumpDecode(compression, [garbage]);

    // 検証：
    expect(getSettledError(decoded)).toBeInstanceOf(Error);
  });

  test("切り詰めた gzip データを流すとエラーが観測される", async ({ expect }) => {
    // 準備：
    const compression = new Compression("gzip");
    const encoded = await encode(compression, createPseudoRandomBytes(4096, 30));

    // 実行：
    const decoded = await pumpDecode(compression, [encoded.subarray(0, encoded.length - 4)]);

    // 検証：
    expect(getSettledError(decoded)).toBeInstanceOf(Error);
  });
});
