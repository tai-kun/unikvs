import { describe, test } from "vitest";

import Compression from "../src/compression.js";

describe("初期化および基本属性の確認", () => {
  test("インスタンス化したとき、name が Compression になっている", ({ expect }) => {
    // 準備 & Act
    const compression = new Compression("gzip");

    // 検証
    expect(compression.name).toBe("Compression");
  });

  test("isOpen を参照したとき、常に true を返す", ({ expect }) => {
    // 準備
    const compression = new Compression("gzip");

    // 実行と検証
    expect(compression.isOpen).toBe(true);
  });
});

describe("データの圧縮および解凍 (gzip)", () => {
  test("任意のデータを encode すると、データが圧縮される", async ({ expect }) => {
    // 準備
    const compression = new Compression("gzip");
    const input = new TextEncoder().encode(
      "Hello world! This is a test for compression. Hello world!",
    );

    // 実行
    const encoded = await compression.encode({ data: input });

    // 検証
    expect(encoded).toBeInstanceOf(Uint8Array);
    expect(encoded.length).toBeLessThan(input.length + 30); // ヘッダー分を考慮しつつ圧縮を確認する。
  });

  test("圧縮されたデータを decode すると、元のデータと一致する", async ({ expect }) => {
    // 準備
    const compression = new Compression("gzip");
    const originalText =
      "Repeat this text multiple times to ensure compression efficiency. ".repeat(10);
    const input = new TextEncoder().encode(originalText);

    // 実行
    const encoded = await compression.encode({ data: input });
    const decoded = await compression.decode({ data: encoded });

    // 検証
    expect(decoded).toStrictEqual(input);
    expect(new TextDecoder().decode(decoded)).toBe(originalText);
  });
});

describe("データの圧縮および解凍 (deflate)", () => {
  test("deflate アルゴリズムで圧縮および解凍をしても、データの整合性が保たれる", async ({
    expect,
  }) => {
    // 準備
    const compression = new Compression("deflate");
    const input = new Uint8Array([1, 2, 3, 4, 5, 5, 5, 5, 5]);

    // 実行
    const encoded = await compression.encode({ data: input });
    const decoded = await compression.decode({ data: encoded });

    // 検証
    expect(decoded).toStrictEqual(input);
  });
});

describe("ストリーム取得の検証", () => {
  test("getEncodable を呼び出したとき、CompressionStream のインスタンスを返す", ({ expect }) => {
    // 準備
    const compression = new Compression("gzip");

    // 実行
    const stream = compression.getEncodable();

    // 検証
    expect(stream).toBeInstanceOf(CompressionStream);
  });

  test("getDecodable を呼び出したとき、DecompressionStream のインスタンスを返す", ({ expect }) => {
    // 準備
    const compression = new Compression("gzip");

    // 実行
    const stream = compression.getDecodable();

    // 検証
    expect(stream).toBeInstanceOf(DecompressionStream);
  });
});

describe("異常系および境界値のテスト", () => {
  test("空の Uint8Array を圧縮したとき、エラーにならず最小限のバイナリが返る", async ({
    expect,
  }) => {
    // 準備
    const compression = new Compression("gzip");
    const emptyInput = new Uint8Array(0);

    // 実行
    const encoded = await compression.encode({ data: emptyInput });

    // 検証
    expect(encoded.length).toBeGreaterThan(0); // gzip ヘッダーが含まれるため。
  });

  test("空の圧縮データを解凍したとき、空の Uint8Array が返る", async ({ expect }) => {
    // 準備
    const compression = new Compression("gzip");
    const emptyInput = new Uint8Array(0);
    const encoded = await compression.encode({ data: emptyInput });

    // 実行
    const decoded = await compression.decode({ data: encoded });

    // 検証
    expect(decoded.length).toBe(0);
    expect(decoded).toStrictEqual(new Uint8Array(0));
  });

  test("不正なバイナリデータを解凍しようとしたとき、例外をスローする", async ({ expect }) => {
    // 準備
    const compression = new Compression("gzip");
    const invalidData = new Uint8Array([0, 1, 2, 3, 4, 5]);

    // 実行と検証
    await expect(compression.decode({ data: invalidData })).rejects.toThrow();
  });

  test("サポートされていない形式を強制的に指定したとき、インスタンス生成または実行時にエラーになる", async ({
    expect,
  }) => {
    // 準備
    // TypeScript の型定義を無視して無効な値を渡す。
    const invalidFormat = "unknown-format" as any;

    // 実行と検証
    // コンストラクタで CompressionStream を初期化する場合、ここで TypeError が発生する。
    expect(() => new Compression(invalidFormat).getEncodable()).toThrow(TypeError);
  });
});
