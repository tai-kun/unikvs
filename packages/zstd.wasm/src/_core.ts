import type { compress, decompress } from "@bokuweb/zstd-wasm";

/**
 * `@bokuweb/zstd-wasm` の解決結果をまとめた実行環境です。
 */
export interface IEnv {
  /**
   * 上流の圧縮関数です。
   */
  readonly compress: typeof compress;

  /**
   * 上流の展開関数です。
   */
  readonly decompress: typeof decompress;
}

/**
 * 圧縮に関するオプションです。
 */
export type CompressOptions = {
  /**
   * 圧縮レベルです。
   */
  readonly level: number;
};

/**
 * テストで差し替えできるよう上流呼び出しを薄く包みます。
 */
export const api = {
  /**
   * `@bokuweb/zstd-wasm` を遅延解決し、初期化します。
   *
   * @returns 解決した実行環境を返します。
   */
  async init(): Promise<IEnv> {
    const wasm = await import("@bokuweb/zstd-wasm");
    await wasm.init();

    return {
      compress: wasm.compress,
      decompress: wasm.decompress,
    };
  },

  /**
   * 指定した圧縮レベルでデータを圧縮します。
   *
   * @param env 使用する実行環境です。
   * @param data 圧縮するバイト列です。
   * @param options オプションです。
   * @returns 圧縮したバイト列を返します。
   */
  compress(
    env: IEnv,
    data: Uint8Array<ArrayBuffer>,
    options: CompressOptions,
  ): Uint8Array {
    const { level } = options;

    return env.compress(data, level);
  },

  /**
   * データを展開します。
   *
   * 失敗時は上流のエラーをそのまま伝播させます。
   *
   * @param env 使用する実行環境です。
   * @param data 展開するバイト列です。
   * @returns 展開したバイト列を返します。
   */
  decompress(env: IEnv, data: Uint8Array<ArrayBuffer>): Uint8Array {
    return env.decompress(data);
  },
};
