import { describe, test } from "vitest";

import Compression from "../src/compression.js";

const FORMATS = ["gzip", "deflate", "deflate-raw"] as const;

/** 疑似乱数ジェネレーター (線形合同法) で、実行ごとに同じバイト列を生成します。 */
function createPseudoRandomBytes(size: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size);
  let state = 0x12345678;

  for (let i = 0; i < size; i++) {
    state = (state * 1664525 + 1013904223) >>> 0;
    bytes[i] = state >>> 24;
  }

  return bytes;
}

async function readAll(stream: ReadableStream<Uint8Array<ArrayBuffer>>): Promise<Uint8Array[]> {
  const reader = stream.getReader();
  const outputChunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    outputChunks.push(value);
  }

  return outputChunks;
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

describe("初期化と基本属性", () => {
  test("name プロパティは Compression を返す", ({ expect }) => {
    // 準備
    const compression = new Compression("gzip");

    // 実行と検証
    expect(compression.name).toBe("Compression");
  });

  test("isOpen プロパティは常に true を返す", ({ expect }) => {
    // 準備
    const compression = new Compression("gzip");

    // 実行と検証
    expect(compression.isOpen).toBe(true);
  });
});

describe("圧縮と展開のラウンドトリップ", () => {
  test("反復的なテキストを各形式で圧縮して展開すると元のデータに戻る", async ({ expect }) => {
    // 準備
    const input = new TextEncoder().encode(
      "Repeat this text multiple times to ensure compression efficiency. ".repeat(100),
    );

    // 実行と検証
    for (const format of FORMATS) {
      const compression = new Compression(format);
      const encoded = await compression.encode({ data: input });
      const decoded = await compression.decode({ data: encoded });
      expect(decoded, `format=${format}`).toStrictEqual(input);
    }
  });

  test("空のデータを各形式で圧縮して展開すると空のデータに戻る", async ({ expect }) => {
    // 準備
    const input = new Uint8Array(0);

    // 実行と検証
    for (const format of FORMATS) {
      const compression = new Compression(format);
      const encoded = await compression.encode({ data: input });
      const decoded = await compression.decode({ data: encoded });
      expect(decoded, `format=${format}`).toStrictEqual(input);
    }
  });

  test("圧縮が意味しないランダムなデータでも gzip のラウンドトリップで元のデータに戻る", async ({
    expect,
  }) => {
    // 準備
    const compression = new Compression("gzip");
    const input = createPseudoRandomBytes(64 * 1024);

    // 実行
    const encoded = await compression.encode({ data: input });
    const decoded = await compression.decode({ data: encoded });

    // 検証
    expect(decoded).toStrictEqual(input);
  });

  test("1 MiB のデータを gzip でラウンドトリップしても元のデータに戻る", async ({ expect }) => {
    // 準備
    const compression = new Compression("gzip");
    const input = createPseudoRandomBytes(1024 * 1024);

    // 実行
    const encoded = await compression.encode({ data: input });
    const decoded = await compression.decode({ data: encoded });

    // 検証
    expect(decoded).toStrictEqual(input);
  });
});

describe("圧縮の効果", () => {
  test("反復的なテキストは gzip で圧縮後に入力より小さくなる", async ({ expect }) => {
    // 準備
    const compression = new Compression("gzip");
    const input = new TextEncoder().encode(
      "Repeat this text multiple times to ensure compression efficiency. ".repeat(100),
    );

    // 実行
    const encoded = await compression.encode({ data: input });

    // 検証
    expect(encoded.length).toBeLessThan(input.length);
  });
});

describe("ストリームによる変換", () => {
  test("getEncodable は指定した形式の CompressionStream を返す", ({ expect }) => {
    // 準備
    const compression = new Compression("gzip");

    // 実行と検証
    expect(compression.getEncodable()).toBeInstanceOf(CompressionStream);
  });

  test("getDecodable は指定した形式の DecompressionStream を返す", ({ expect }) => {
    // 準備
    const compression = new Compression("gzip");

    // 実行と検証
    expect(compression.getDecodable()).toBeInstanceOf(DecompressionStream);
  });

  test("大きさが不揃いな複数チャンクをストリームで圧縮して展開すると元のデータに戻る", async ({
    expect,
  }) => {
    // 準備
    const compression = new Compression("gzip");
    const input = createPseudoRandomBytes(8192);
    const inputChunks = [input.subarray(0, 13), input.subarray(13, 4097), input.subarray(4097)];
    const source = new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        for (const chunk of inputChunks) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    });

    // 実行
    const transformed = source
      .pipeThrough(compression.getEncodable())
      .pipeThrough(compression.getDecodable());
    const decodedChunks = await readAll(transformed);

    // 検証
    expect(concatBytes(decodedChunks)).toStrictEqual(input);
  });
});

describe("異常系", () => {
  test("圧縮データではないバイト列を decode すると拒否される", async ({ expect }) => {
    // 準備
    const compression = new Compression("gzip");
    const invalidData = new Uint8Array([0, 1, 2, 3, 4, 5]);

    // 実行と検証
    await expect(compression.decode({ data: invalidData })).rejects.toThrow(Error);
  });

  test("サポートされていない形式は getEncodable の時点で TypeError を投げる", ({ expect }) => {
    // 準備
    // TypeScript の型定義を無視して無効な値を渡す。
    const invalidFormat = "unknown-format" as never;

    // 実行と検証
    expect(() => new Compression(invalidFormat).getEncodable()).toThrow(TypeError);
  });
});
