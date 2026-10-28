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
 * 展開後サイズを保持しないフレームに対して最初に確保するヒープサイズです。
 *
 * 上流の `decompress` の既定値と同じ 1 MiB です。
 */
const INITIAL_DECOMPRESS_HEAP_SIZE = 1024 * 1024;

/**
 * 展開後サイズを保持しないフレームに対して確保するヒープサイズの上限です。
 *
 * 上流の WASM ヒープは最大 2 GiB であるため、圧縮データと作業領域の余裕を残して 1 GiB に制限します。
 */
const MAX_DECOMPRESS_HEAP_SIZE = 1024 * 1024 * 1024;

/**
 * zstd が展開先バッファー不足を表すエラーコードです。
 *
 * `ZSTD_error_dstSize_tooSmall` に相当し、上流は `Failed to compress with code -70` というメッセージの `Error` を投げます。
 */
const DST_SIZE_TOO_SMALL_ERROR_CODE = "-70";

/**
 * 空の入力を展開しようとしたときのエラーメッセージです。
 */
const EMPTY_INPUT_ERROR_MESSAGE = "Cannot decompress an empty input";

/**
 * 展開先バッファー不足によるエラーかを判定します。
 *
 * 上流はエラーコードを専用の型で公開しないため、メッセージ末尾のコードで判定します。
 *
 * @param error 判定対象の値です。
 *
 * @returns 展開先バッファー不足なら true を返します。
 */
function isDstSizeTooSmallError(error: unknown): boolean {
  return error instanceof Error && error.message.endsWith(`code ${DST_SIZE_TOO_SMALL_ERROR_CODE}`);
}

/**
 * 空の入力を拒否します。
 *
 * 上流は空の入力を空の展開結果として受け入れるため、破損データとの取り違えを防ぐために呼び出し側で拒否します。
 *
 * @param data 検証するバイト列です。
 */
function assertNotEmpty(data: Uint8Array): void {
  if (data.byteLength === 0) {
    throw new Error(EMPTY_INPUT_ERROR_MESSAGE);
  }
}

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
   *
   * @returns 圧縮したバイト列を返します。
   */
  compress(env: IEnv, data: Uint8Array<ArrayBuffer>, options: CompressOptions): Uint8Array {
    const { level } = options;

    return env.compress(data, level);
  },

  /**
   * データを展開します。
   *
   * フレームに展開後サイズが記録されていない場合は、展開結果が収まるまでヒープサイズを倍にして再試行します。
   *
   * 失敗時は上流のエラーをそのまま伝播させます。
   *
   * @param env 使用する実行環境です。
   * @param data 展開するバイト列です。
   *
   * @returns 展開したバイト列を返します。
   */
  decompress(env: IEnv, data: Uint8Array<ArrayBuffer>): Uint8Array {
    assertNotEmpty(data);

    let heapSize = INITIAL_DECOMPRESS_HEAP_SIZE;

    for (;;) {
      try {
        return env.decompress(data, { defaultHeapSize: heapSize });
      } catch (error) {
        const canRetry = heapSize < MAX_DECOMPRESS_HEAP_SIZE && isDstSizeTooSmallError(error);

        if (!canRetry) {
          throw error;
        }

        heapSize = Math.min(heapSize * 2, MAX_DECOMPRESS_HEAP_SIZE);
      }
    }
  },
};
