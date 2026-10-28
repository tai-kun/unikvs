import type { constants, zstdCompressSync, zstdDecompressSync } from "node:zlib";

import type { ITransformStream } from "@unikvs/core";
import { toOwnedBytes } from "@unikvs/utils";

/**
 * `node:zlib` の zstd に関する部分です。
 */
type NodeZlibModule = {
  /**
   * 同期圧縮関数です。
   */
  readonly zstdCompressSync: typeof zstdCompressSync;

  /**
   * 同期展開関数です.
   */
  readonly zstdDecompressSync: typeof zstdDecompressSync;

  /**
   * 圧縮パラメーターを指定するための定数です。
   */
  readonly constants: typeof constants;
};

/**
 * 解決した zstd 実装をまとめた実行環境です。
 */
export interface IEnv {
  /**
   * 使用中の実装の種類です。
   *
   * Bun ランタイムでは `bun`、それ以外の Node.js 互換環境では `node` になります。
   */
  readonly kind: "bun" | "node";

  /**
   * 指定した圧縮レベルでデータを圧縮する関数です。
   */
  readonly compressSync: (data: Uint8Array, level: number) => Uint8Array;

  /**
   * データを展開する関数です。
   */
  readonly decompressSync: (data: Uint8Array) => Uint8Array;
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
 * 空の入力を展開しようとしたときのエラーメッセージです。
 */
const EMPTY_INPUT_ERROR_MESSAGE = "Cannot decompress an empty input";

/**
 * 空の入力を拒否します。
 *
 * Bun の zstd API は空の入力を空の展開結果として受け入れるため、破損データとの取り違えを防ぐために呼び出し側で拒否します。
 *
 * @param data 検証するバイト列です。
 */
function assertNotEmpty(data: Uint8Array): void {
  if (data.byteLength === 0) {
    throw new Error(EMPTY_INPUT_ERROR_MESSAGE);
  }
}

/**
 * Bun 名前空間の zstd API に関する部分です。
 *
 * `@types/bun` には zstd の宣言がまだないため、brotli 系 API と同じ `{ level }` 形式のオプションを受け付ける形状を想定して定義します。
 */
type BunZstdApi = {
  /**
   * 圧縮関数です。
   */
  readonly zstdCompressSync: (data: Uint8Array, options?: { level?: number }) => Uint8Array;

  /**
   * 展開関数です。
   */
  readonly zstdDecompressSync: (data: Uint8Array) => Uint8Array;
};

/**
 * 実行環境の Bun 名前空間を読み取ります。
 *
 * @returns Bun 名前空間、または利用できない場合は `undefined` を返します。
 */
function readBunProbe(): unknown {
  return Reflect.get(globalThis, "Bun");
}

/**
 * プローブが bun の zstd API を備えているかを判定します。
 *
 * @param probe 判定対象のプローブです。
 *
 * @returns bun の zstd API を備えていれば `true` を返します。
 */
function isBunZstdApi(probe: unknown): probe is BunZstdApi {
  if (typeof probe !== "object" || probe === null) {
    return false;
  }

  return (
    typeof Reflect.get(probe, "zstdCompressSync") === "function" &&
    typeof Reflect.get(probe, "zstdDecompressSync") === "function"
  );
}

/**
 * チャンク列を結合して 1 つの所有化されたバイト列にします。
 *
 * @param chunks 結合するチャンク列です。
 *
 * @returns 結合したバイト列を返します。
 */
function concatChunks(chunks: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  let total = 0;

  for (const chunk of chunks) {
    total += chunk.byteLength;
  }

  const data = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return data;
}

/**
 * 書き込まれたチャンクを蓄積し、flush 時に一括変換して 1 チャンクとして出力する TransformStream を作成します。
 *
 * @param convert 蓄積したバイト列を変換する関数です。
 *
 * @returns 変換用のストリームを返します。
 */
function createAccumulatingStream(
  convert: (data: Uint8Array<ArrayBuffer>) => Uint8Array,
): ITransformStream<Uint8Array, Uint8Array<ArrayBuffer>> {
  const chunks: Uint8Array[] = [];

  return new TransformStream({
    transform(chunk) {
      chunks.push(chunk);
    },

    flush(controller) {
      const data = concatChunks(chunks);

      chunks.length = 0;
      controller.enqueue(toOwnedBytes(convert(data)));
    },
  });
}

/**
 * テストで差し替えできるよう上流呼び出しを薄く包みます。
 */
export const api = {
  /**
   * Bun の zstd API を解決します。
   *
   * 利用できない場合は `undefined` を返します。
   *
   * @param probe 解決対象の Bun 名前空間のプローブです。
   *
   * @returns Bun の名前空間、または `undefined` を返します。
   */
  detectBun(probe: unknown): BunZstdApi | undefined {
    return isBunZstdApi(probe) ? probe : undefined;
  },

  /**
   * `node:zlib` から zstd 実行環境を作成します。
   *
   * zstd 系 API が欠けている場合はエラーを投げます。
   *
   * @param zlib `node:zlib` モジュールです。
   *
   * @returns 解決した実行環境を返します。
   */
  createNodeEnv(zlib: NodeZlibModule): IEnv {
    if (typeof zlib.zstdCompressSync !== "function") {
      throw new TypeError("zstdCompressSync is not available in node:zlib");
    }

    if (typeof zlib.zstdDecompressSync !== "function") {
      throw new TypeError("zstdDecompressSync is not available in node:zlib");
    }

    return {
      kind: "node",
      compressSync: (data, level) =>
        zlib.zstdCompressSync(data, {
          params: {
            [zlib.constants.ZSTD_c_compressionLevel]: level,
          },
        }),
      decompressSync: (data) => zlib.zstdDecompressSync(data),
    };
  },

  /**
   * zstd 実装を遅延解決します。
   *
   * Bun ランタイムでは `Bun.zstdCompressSync` と `Bun.zstdDecompressSync` を使い、それ以外の環境では `node:zlib` の zstd 系 API へフォールバックします。
   *
   * @returns 解決した実行環境を返します。
   */
  async init(): Promise<IEnv> {
    const bun = api.detectBun(readBunProbe());

    if (bun) {
      return {
        kind: "bun",
        compressSync: (data, level) => bun.zstdCompressSync(data, { level }),
        decompressSync: (data) => bun.zstdDecompressSync(data),
      };
    }

    const zlib = await import("node:zlib");

    return api.createNodeEnv(zlib);
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
  compress(env: IEnv, data: Uint8Array, options: CompressOptions): Uint8Array {
    const { level } = options;

    return env.compressSync(data, level);
  },

  /**
   * データを展開します。
   *
   * 空の入力は破損データとの取り違えを防ぐため拒否します。
   *
   * 失敗時は上流のエラーをそのまま伝播させます。
   *
   * @param env 使用する実行環境です。
   * @param data 展開するバイト列です。
   *
   * @returns 展開したバイト列を返します。
   */
  decompress(env: IEnv, data: Uint8Array): Uint8Array {
    assertNotEmpty(data);

    return env.decompressSync(data);
  },

  /**
   * 指定した圧縮レベルで圧縮する TransformStream を作成します。
   *
   * Bun にストリーミング用の zstd API がないため、書き込まれたチャンクを蓄積し、flush 時に一括変換して 1 チャンクとして出力します。
   *
   * @param env 使用する実行環境です。
   * @param options オプションです。
   *
   * @returns 圧縮用のストリームを返します。
   */
  createCompress(
    env: IEnv,
    options: CompressOptions,
  ): ITransformStream<Uint8Array, Uint8Array<ArrayBuffer>> {
    // open() 前の利用は TypeError で拒否されるよう、実行環境へ同期的に触れます。
    const compressSync = env.compressSync;
    const { level } = options;

    return createAccumulatingStream((data) => compressSync(data, level));
  },

  /**
   * 展開用の TransformStream を作成します。
   *
   * Bun にストリーミング用の zstd API がないため、書き込まれたチャンクを蓄積し、flush 時に一括変換して 1 チャンクとして出力します。
   * 空の入力は破損データとの取り違えを防ぐため拒否します。
   *
   * @param env 使用する実行環境です。
   *
   * @returns 展開用のストリームを返します。
   */
  createDecompress(env: IEnv): ITransformStream<Uint8Array, Uint8Array<ArrayBuffer>> {
    // open() 前の利用は TypeError で拒否されるよう、実行環境へ同期的に触れます。
    const decompressSync = env.decompressSync;

    return createAccumulatingStream((data) => {
      assertNotEmpty(data);

      return decompressSync(data);
    });
  },
};
