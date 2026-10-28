import type { compress, decompress } from "brotli-wasm";

/**
 * `brotli-wasm` の解決結果をまとめた実行環境です。
 *
 * ブラウザーと Node.js のどちらでも動作します。
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
 * 上流の送出値を Error へ正規化します。
 *
 * `brotli-wasm` は失敗時に文字列などの非 Error 値を送出する場合があるため、呼び出し側が `Error` として扱えるよう包み直します。
 */
function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(typeof error === "string" ? error : String(error), { cause: error });
}

/**
 * 同期関数を実行し、送出された値を `Error` へ正規化して再送出します。
 *
 * @param fn 実行する関数です。
 *
 * @returns 関数の戻り値を返します。
 */
function withNormalizedError<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    throw toError(error);
  }
}

/**
 * テストで差し替えできるよう上流呼び出しを薄く包みます。
 */
export const api = {
  /**
   * `brotli-wasm` を遅延解決します。
   *
   * ESM の `import` はブラウザーでは Web ビルドに解決され、そのまま動作します。
   * 一方 Node.js の ESM では Web ビルドに解決されて WASM の取得に失敗するため、失敗時は Node.js 用の CJS ビルドへフォールバックします。
   *
   * 上流の `default` は Web ビルドでは `Promise` ですが、`await` が同期値も透過するため分岐は不要です。
   *
   * 関数の有無はここでは検証せず、使用時のエラーをそのまま表面化させます。
   *
   * @returns 解決した実行環境を返します。
   */
  async init(): Promise<IEnv> {
    try {
      const mod = await import("brotli-wasm");
      const wasm = await Promise.resolve(mod.default);

      return {
        compress: wasm.compress,
        decompress: wasm.decompress,
      };
    } catch {
      const { createRequire } = await import("node:module");
      const require = createRequire(import.meta.url);
      const nodeApi = require("brotli-wasm") as IEnv;

      return {
        compress: nodeApi.compress,
        decompress: nodeApi.decompress,
      };
    }
  },

  /**
   * 指定した圧縮レベルでデータを圧縮します。
   *
   * @param env 使用する実行環境です。
   * @param data 圧縮するバイト列です。
   * @param options オプションです。
   *
   * @returns 圧縮したバイト列を返します。
   */
  compress(env: IEnv, data: Uint8Array<ArrayBuffer>, options: CompressOptions): Uint8Array {
    const { level } = options;

    return withNormalizedError(() => env.compress(data, { quality: level }));
  },

  /**
   * データを展開します。
   *
   * 失敗時は上流の送出値を `Error` へ正規化して伝播させます。
   *
   * @param env 使用する実行環境です。
   * @param data 展開するバイト列です。
   *
   * @returns 展開したバイト列を返します。
   */
  decompress(env: IEnv, data: Uint8Array<ArrayBuffer>): Uint8Array {
    return withNormalizedError(() => env.decompress(data));
  },
};
