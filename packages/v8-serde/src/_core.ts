import type { serialize, deserialize } from "node:v8";

/**
 * `node:v8` の解決結果をまとめた実行環境です。
 */
export interface IEnv {
  /**
   * 上流のシリアライザーです。
   */
  readonly serialize: typeof serialize;

  /**
   * 上流のデシリアライザーです。
   */
  readonly deserialize: typeof deserialize;
}

/**
 * テストで差し替えできるよう、上流モジュールの解決を薄く包みます。
 */
export const api = {
  /**
   * `node:v8` を遅延解決します。
   *
   * 失敗時は上流のエラーをそのまま伝播させます。
   * 呼び出し側の `open()` で `UnsupportedRuntimeError` に包みます。
   *
   * @returns 解決した実行環境を返します。
   */
  async init(): Promise<IEnv> {
    const v8 = await import("node:v8");

    return {
      serialize: v8.serialize,
      deserialize: v8.deserialize,
    };
  },
};
