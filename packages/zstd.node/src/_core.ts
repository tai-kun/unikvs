import type { Transform } from "node:stream";
import type {
  constants,
  zstdCompress,
  zstdDecompress,
  createZstdCompress,
  createZstdDecompress,
} from "node:zlib";

import type { ITransformStream } from "@unikvs/core";

/**
 * `node:zlib` と周辺モジュールの解決結果をまとめた実行環境です。
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
   * プロミス化した zstd 圧縮関数です。
   */
  readonly zstdCompress: typeof zstdCompress.__promisify__;

  /**
   * プロミス化した zstd 展開関数です。
   */
  readonly zstdDecompress: typeof zstdDecompress.__promisify__;

  /**
   * zstd 圧縮ストリームを作成する関数です。
   */
  readonly createZstdCompress: typeof createZstdCompress;

  /**
   * zstd 展開ストリームを作成する関数です。
   */
  readonly createZstdDecompress: typeof createZstdDecompress;
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
   * `node:util`, `node:zlib`, `node:stream` を遅延解決します。
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
      constants: zlib.constants,
      Transform: stream.Transform,
      zstdCompress: util.promisify(zlib.zstdCompress),
      zstdDecompress: util.promisify(zlib.zstdDecompress),
      createZstdCompress: zlib.createZstdCompress,
      createZstdDecompress: zlib.createZstdDecompress,
    };
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
  async compress(
    env: IEnv,
    data: Uint8Array<ArrayBuffer>,
    options: CompressOptions,
  ): Promise<Buffer> {
    const { level } = options;

    return env.zstdCompress(data, {
      params: {
        [env.constants.ZSTD_c_compressionLevel]: level,
      },
    });
  },

  /**
   * データを展開します。
   *
   * @param env 使用する実行環境です。
   * @param data 展開するバイト列です。
   *
   * @returns 展開したバイト列を返します。
   */
  async decompress(env: IEnv, data: Uint8Array<ArrayBuffer>): Promise<Buffer> {
    return env.zstdDecompress(data);
  },

  /**
   * 指定した圧縮レベルで圧縮する ITransformStream を作成します。
   *
   * @param env 使用する実行環境です。
   * @param options オプションです。
   *
   * @returns 圧縮用のストリームを返します。
   */
  createCompress(env: IEnv, options: CompressOptions): ITransformStream<Buffer, Buffer> {
    const { level } = options;
    const duplex = env.createZstdCompress({
      params: {
        [env.constants.ZSTD_c_compressionLevel]: level,
      },
    });

    // toWeb しても ReadableStream と WritableStream の互換性エラーが出るためキャストします。
    return env.Transform.toWeb(duplex);
  },

  /**
   * 展開用の ITransformStream を作成します。
   *
   * @param env 使用する実行環境です。
   *
   * @returns 展開用のストリームを返します。
   */
  createDecompress(env: IEnv): ITransformStream<Buffer, Buffer> {
    const duplex = env.createZstdDecompress();

    // toWeb しても ReadableStream と WritableStream の互換性エラーが出るためキャストします。
    return env.Transform.toWeb(duplex);
  },
};
