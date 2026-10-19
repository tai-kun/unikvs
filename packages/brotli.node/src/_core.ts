import type { Transform } from "node:stream";
import type {
  brotliCompress,
  brotliDecompress,
  constants,
  createBrotliCompress,
  createBrotliDecompress,
} from "node:zlib";

import type { ITransformStream } from "@unikvs/core";

/**
 * `node:zlib` と周辺モジュールの解決結果をまとめた実行環境です。
 *
 * Web の CompressionStream には brotli 形式が存在しないため、
 * 圧縮処理は常に `node:zlib` へ委譲します。このため、このパッケージは
 * Node.js ランタイム専用です。
 */
export interface IEnv {
  /**
   * Node ストリームを Web ストリームへ変換するための Transform です。
   */
  readonly Transform: typeof Transform;

  /**
   * 圧縮パラメーターを指定するための定数です。
   */
  readonly constants: typeof constants;

  /**
   * プロミス化した brotli 圧縮関数です。
   */
  readonly brotliCompress: typeof brotliCompress.__promisify__;

  /**
   * プロミス化した brotli 展開関数です。
   */
  readonly brotliDecompress: typeof brotliDecompress.__promisify__;

  /**
   * brotli 圧縮ストリームを作成する関数です。
   */
  readonly createBrotliCompress: typeof createBrotliCompress;

  /**
   * brotli 展開ストリームを作成する関数です。
   */
  readonly createBrotliDecompress: typeof createBrotliDecompress;
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
   * `node:util`、`node:zlib`、`node:stream` を遅延解決します。
   *
   * @returns 解決した実行環境を返します。
   */
  async init(): Promise<IEnv> {
    const [util, zlib, stream] = await Promise.all([
      import("node:util"),
      import("node:zlib"),
      import("node:stream"),
    ]);

    return {
      Transform: stream.Transform,
      constants: zlib.constants,
      brotliCompress: util.promisify(zlib.brotliCompress),
      brotliDecompress: util.promisify(zlib.brotliDecompress),
      createBrotliCompress: zlib.createBrotliCompress,
      createBrotliDecompress: zlib.createBrotliDecompress,
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
  async compress(
    env: IEnv,
    data: Uint8Array<ArrayBuffer>,
    options: CompressOptions,
  ): Promise<Buffer> {
    const { level } = options;

    return await env.brotliCompress(data, {
      params: {
        [env.constants.BROTLI_PARAM_QUALITY]: level,
      },
    });
  },

  /**
   * データを展開します。
   *
   * @param env 使用する実行環境です。
   * @param data 展開するバイト列です。
   * @returns 展開したバイト列を返します。
   */
  async decompress(env: IEnv, data: Uint8Array<ArrayBuffer>): Promise<Buffer> {
    return await env.brotliDecompress(data);
  },

  /**
   * 指定した圧縮レベルで圧縮する ITransformStream を作成します。
   *
   * @param env 使用する実行環境です。
   * @param options オプションです。
   * @returns 圧縮用のストリームを返します。
   */
  createCompress(env: IEnv, options: CompressOptions): ITransformStream<Buffer, Buffer> {
    const { level } = options;
    const duplex = env.createBrotliCompress({
      params: {
        [env.constants.BROTLI_PARAM_QUALITY]: level,
      },
    });

    // toWeb しても ReadableStream と WritableStream の互換性エラーが出るためキャストします。
    return env.Transform.toWeb(duplex) as ITransformStream;
  },

  /**
   * 展開用の ITransformStream を作成します。
   *
   * @param env 使用する実行環境です。
   * @returns 展開用のストリームを返します。
   */
  createDecompress(env: IEnv): ITransformStream<Buffer, Buffer> {
    const duplex = env.createBrotliDecompress();

    // toWeb しても ReadableStream と WritableStream の互換性エラーが出るためキャストします。
    return env.Transform.toWeb(duplex) as ITransformStream;
  },
};
