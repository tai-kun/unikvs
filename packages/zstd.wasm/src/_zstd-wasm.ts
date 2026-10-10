import { compress, decompress, init } from "@bokuweb/zstd-wasm";

// テストで差し替えできるよう上流呼び出しを薄く包みます。
export const wasmBridge = {
  // WASM の初期化を1回だけ実行します。
  async init(): Promise<void> {
    await init();
  },

  // 上流の圧縮呼び出しを薄く包みます。
  compress(data: Uint8Array, level: number): Uint8Array {
    return compress(data, level);
  },

  // 上流の展開呼び出しを薄く包みます。
  decompress(data: Uint8Array): Uint8Array {
    return decompress(data);
  },
};
