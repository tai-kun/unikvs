import { createPseudoRandomBytes } from "@unikvs/testing";
import { describe, test } from "vitest";

import ZstdNode from "../src/zstd-node.js";

describe("zstd フレーム", () => {
  test("encode したデータは zstd のマジックバイトで始まる", async ({ expect, signal }) => {
    // 準備
    const target = new ZstdNode();
    await target.open({ signal });
    const input = createPseudoRandomBytes(512, 7);

    // 実行
    const encoded = await target.encode({ data: input });

    // 検証
    // zstd マジック 0xFD2FB528 のリトルエンディアン先頭 4 バイトです。
    expect(Array.from(encoded.subarray(0, 4))).toStrictEqual([0x28, 0xb5, 0x2f, 0xfd]);
  });

  test("異なるレベルで圧縮したデータは互いに展開できる", async ({ expect, signal }) => {
    // 準備
    const input = createPseudoRandomBytes(1024, 8);
    const low = new ZstdNode({ level: 1 });
    const high = new ZstdNode({ level: 22 });
    await low.open({ signal });
    await high.open({ signal });

    // 実行
    const decodedLow = await high.decode({ data: await low.encode({ data: input }) });
    const decodedHigh = await low.decode({ data: await high.encode({ data: input }) });

    // 検証
    expect(decodedLow).toStrictEqual(input);
    expect(decodedHigh).toStrictEqual(input);
  });
});

describe("他形式との非互換", () => {
  test("gzip データを decode するとエラーで拒否される", async ({ expect, signal }) => {
    // 準備
    const target = new ZstdNode();
    await target.open({ signal });
    const input = createPseudoRandomBytes(512, 9);
    const source = new CompressionStream("gzip");
    const reading = new Response(source.readable).arrayBuffer();
    const writer = source.writable.getWriter();

    // 実行
    await writer.write(input);
    await writer.close();
    const gzipData = new Uint8Array(await reading);

    // 検証
    // 実装は展開失敗を専用エラーで包まず上流エラーをそのまま伝搬するため、汎用エラーを検証する。
    await expect(target.decode({ data: gzipData })).rejects.toThrow(Error);
  });

  test("deflate データを decode するとエラーで拒否される", async ({ expect, signal }) => {
    // 準備
    const target = new ZstdNode();
    await target.open({ signal });
    const input = createPseudoRandomBytes(512, 17);
    const source = new CompressionStream("deflate");
    const reading = new Response(source.readable).arrayBuffer();
    const writer = source.writable.getWriter();

    // 実行
    await writer.write(input);
    await writer.close();
    const deflateData = new Uint8Array(await reading);

    // 検証
    await expect(target.decode({ data: deflateData })).rejects.toThrow(Error);
  });

  test("deflate-raw データを decode するとエラーで拒否される", async ({ expect, signal }) => {
    // 準備
    const target = new ZstdNode();
    await target.open({ signal });
    const input = createPseudoRandomBytes(512, 18);
    const source = new CompressionStream("deflate-raw");
    const reading = new Response(source.readable).arrayBuffer();
    const writer = source.writable.getWriter();

    // 実行
    await writer.write(input);
    await writer.close();
    const rawDeflateData = new Uint8Array(await reading);

    // 検証
    await expect(target.decode({ data: rawDeflateData })).rejects.toThrow(Error);
  });

  test("zstd データを gzip として decode すると拒否される", async ({ expect, signal }) => {
    // 準備
    const target = new ZstdNode();
    await target.open({ signal });
    const input = createPseudoRandomBytes(512, 10);
    const encoded = await target.encode({ data: input });
    const source = new DecompressionStream("gzip");
    const writer = source.writable.getWriter();
    const reading = new Response(source.readable).arrayBuffer().then(
      (buffer) => ({ buffer, error: undefined as unknown }),
      (error: unknown) => ({ buffer: undefined as unknown as ArrayBuffer, error }),
    );

    // 実行
    const writeError = await writer.write(encoded).then(
      () =>
        writer.close().then(
          () => undefined as unknown,
          (error: unknown) => error,
        ),
      (error: unknown) => error,
    );
    const { error: readError } = await reading;

    // 検証
    expect(writeError ?? readError).toBeInstanceOf(Error);
  });
});
