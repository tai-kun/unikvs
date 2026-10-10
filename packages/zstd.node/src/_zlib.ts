// テストで差し替えできるよう上流呼び出しを薄く包みます。
export const zlibBridge = {
  // node:zlib の解決を1回だけ実行できるよう遅延させます。
  async load(): Promise<typeof import("node:zlib")> {
    return await import("node:zlib");
  },

  // 上流の圧縮呼び出しを薄く包みます。
  compress(zlib: typeof import("node:zlib"), data: Uint8Array, level: number): Uint8Array {
    return zlib.zstdCompressSync(data, {
      params: { [zlib.constants.ZSTD_c_compressionLevel]: level },
    });
  },

  // 上流の展開呼び出しを薄く包みます。
  decompress(zlib: typeof import("node:zlib"), data: Uint8Array): Uint8Array {
    return zlib.zstdDecompressSync(data);
  },
};
