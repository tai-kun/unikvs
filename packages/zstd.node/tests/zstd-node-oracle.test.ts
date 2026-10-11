import { zstdCompressSync, zstdDecompressSync } from "node:zlib";

import { createPseudoRandomBytes } from "@unikvs/testing";
import { describe, test } from "vitest";

import ZstdNode from "../src/zstd-node.js";

// node:zlib の zstd 系 API が利用できない Node 版では当該 2 件をスキップする。
const hasZstd = typeof zstdCompressSync === "function" && typeof zstdDecompressSync === "function";

describe.skipIf(!hasZstd)("node:zlib との相互運用", () => {
  test("node:zlib で圧縮したフレームを decode で展開できる", async ({ expect }) => {
    // 準備
    const target = new ZstdNode();
    const input = createPseudoRandomBytes(1024, 15);
    const compressed = zstdCompressSync(input);

    // 実行
    const decoded = await target.decode({ data: new Uint8Array(compressed) });

    // 検証
    expect(decoded).toStrictEqual(input);
  });

  test("encode の出力を node:zlib で展開できる", async ({ expect }) => {
    // 準備
    const target = new ZstdNode();
    const input = createPseudoRandomBytes(1024, 16);

    // 実行
    const encoded = await target.encode({ data: input });
    const decompressed = zstdDecompressSync(encoded);

    // 検証
    expect(new Uint8Array(decompressed)).toStrictEqual(input);
  });
});
