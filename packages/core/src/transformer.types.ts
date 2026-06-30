import type { MaybePromise } from "maypromise";

import type { Context } from "./context.types.js";

/**
 * トランスフォーマーに関連する引数の型定義を格納する名前空間です。
 *
 * @example
 * `Pick` を使用して必要なプロパティーのみを受け取る実装パターンです。
 *
 * ```ts
 * import type { ITransformer } from "@unikvs/core";
 *
 * class Compression implements ITransformer {
 *   public encode(
 *     args: Pick<ITransformer.EncodeArgs<Uint8Array<ArrayBuffer>>, "data">,
 *   ): Promise<Uint8Array<ArrayBuffer>> {
 *     // ...
 *   }
 * }
 * ```
 */
export namespace ITransformer {
  /**
   * エンコード可能なストリームを取得する際の引数定義です。
   *
   * @example
   * コンテキストからチェックサムを読み取る実装です。
   *
   * ```ts
   * import type { ITransformer } from "@unikvs/core";
   *
   * class Checksum implements ITransformer {
   *   public getEncodable(
   *     args: Pick<ITransformer.GetEncodableArgs, "context">,
   *   ): TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>> {
   *     const expected = args.context[CHECKSUM_CONTEXT_KEY];
   *     // ...
   *   }
   * }
   * ```
   */
  export type GetEncodableArgs = {
    /**
     * 実行時のコンテキスト情報です。
     */
    context: Context;

    /**
     * 処理の中断を通知するためのシグナルです。
     */
    signal: AbortSignal;
  };

  /**
   * デコード可能なストリームを取得する際の引数定義です。
   *
   * @example
   * ```ts
   * import type { ITransformer } from "@unikvs/core";
   *
   * class Checksum implements ITransformer {
   *   public getDecodable(
   *     args: Pick<ITransformer.GetDecodableArgs, "context">,
   *   ): TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>> {
   *     const expected = args.context[CHECKSUM_CONTEXT_KEY];
   *     // ...
   *   }
   * }
   * ```
   */
  export type GetDecodableArgs = {
    /**
     * 実行時のコンテキスト情報です。
     */
    context: Context;

    /**
     * 処理の中断を通知するためのシグナルです。
     */
    signal: AbortSignal;
  };

  /**
   * トランスフォーマーをオープンする際の引数定義です。
   */
  export type OpenArgs = {
    /**
     * 実行時のコンテキスト情報です。
     */
    context: Context;

    /**
     * 処理の中断を通知するためのシグナルです。
     */
    signal: AbortSignal;
  };

  /**
   * トランスフォーマーをクローズする際の引数定義です。
   */
  export type CloseArgs = {
    /**
     * 実行時のコンテキスト情報です。
     */
    context: Context;

    /**
     * 処理の中断を通知するためのシグナルです。
     */
    signal: AbortSignal;
  };

  /**
   * データをエンコードする際の引数定義です。
   *
   * @template TData エンコード対象となるデータの型です。
   *
   * @example
   * 圧縮トランスフォーマーのエンコード実装です。
   *
   * ```ts
   * import type { ITransformer } from "@unikvs/core";
   *
   * class Compression implements ITransformer {
   *   public async encode(
   *     args: Pick<ITransformer.EncodeArgs<Uint8Array<ArrayBuffer>>, "data">,
   *   ): Promise<Uint8Array<ArrayBuffer>> {
   *     const stream = new CompressionStream("gzip");
   *     const body = toReadableStream([args.data]).pipeThrough(stream);
   *     return new Uint8Array(await new Response(body).arrayBuffer());
   *   }
   * }
   * ```
   */
  export type EncodeArgs<TData = any> = {
    /**
     * 実行時のコンテキスト情報です。
     */
    context: Context;

    /**
     * エンコードする対象のデータ本体です。
     */
    data: TData;

    /**
     * 処理の中断を通知するためのシグナルです。
     */
    signal: AbortSignal;
  };

  /**
   * データをデコードする際の引数定義です。
   *
   * @template TData デコード対象となるデータの型です。
   *
   * @example
   * 伸長トランスフォーマーのデコード実装です。
   *
   * ```ts
   * import type { ITransformer } from "@unikvs/core";
   *
   * class Compression implements ITransformer {
   *   public async decode(
   *     args: Pick<ITransformer.DecodeArgs<Uint8Array<ArrayBuffer>>, "data">,
   *   ): Promise<Uint8Array<ArrayBuffer>> {
   *     const stream = new DecompressionStream("gzip");
   *     const body = toReadableStream([args.data]).pipeThrough(stream);
   *     return new Uint8Array(await new Response(body).arrayBuffer());
   *   }
   * }
   * ```
   */
  export type DecodeArgs<TData = any> = {
    /**
     * 実行時のコンテキスト情報です。
     */
    context: Context;

    /**
     * デコードする対象のデータ本体です。
     */
    data: TData;

    /**
     * 処理の中断を通知するためのシグナルです。
     */
    signal: AbortSignal;
  };
}

/**
 * エンコード処理を行うストリームのインターフェースです。
 *
 * `TransformStream` を継承し、ストリーミングパイプラインの一部として機能します。
 *
 * @template TChunkInput 入力されるチャンクの型です。
 * @template TChunkOutput 出力されるチャンクの型です。
 *
 * @example
 * ```ts
 * import type { IEncodable, ITransformer } from "@unikvs/core";
 *
 * class Compression implements ITransformer {
 *   public getEncodable(): IEncodable<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>> {
 *     return new CompressionStream("gzip");
 *   }
 * }
 * ```
 */
export interface IEncodable<TChunkInput = any, TChunkOutput = any> extends TransformStream<
  TChunkInput,
  TChunkOutput
> {}

/**
 * エンコード可能なストリームを生成・提供するトランスフォーマーのインターフェースです。
 *
 * @template TChunkInput 入力されるチャンクの型です。
 * @template TChunkOutput 出力されるチャンクの型です。
 *
 * @example
 * ```ts
 * import { type IEncodableStreamTransformer, type ITransformer } from "@unikvs/core";
 *
 * class Compression implements IEncodableStreamTransformer {
 *   public getEncodable(): TransformStream {
 *     return new CompressionStream("gzip");
 *   }
 * }
 * ```
 */
export interface IEncodableStreamTransformer<TChunkInput = any, TChunkOutput = any> {
  /**
   * エンコード処理のための `IEncodable` ストリームインスタンスを返します。
   *
   * @param args ストリーム取得に必要な引数オブジェクトです。
   * @returns エンコード可能なストリーム、またはそれを解決する Promise です。
   */
  getEncodable(
    args: ITransformer.GetEncodableArgs,
  ): MaybePromise<IEncodable<TChunkInput, TChunkOutput>>;
}

/**
 * デコード処理を行うストリームのインターフェースです。
 *
 * `TransformStream` を継承し、ストリーミングパイプラインの一部として機能します。
 *
 * @template TChunkInput 入力されるチャンクの型です。
 * @template TChunkOutput 出力されるチャンクの型です。
 *
 * @example
 * ```ts
 * import type { IDecodable, ITransformer } from "@unikvs/core";
 *
 * class Compression implements ITransformer {
 *   public getDecodable(): IDecodable<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>> {
 *     return new DecompressionStream("gzip");
 *   }
 * }
 * ```
 */
export interface IDecodable<TChunkInput = any, TChunkOutput = any> extends TransformStream<
  TChunkInput,
  TChunkOutput
> {}

/**
 * デコード可能なストリームを生成・提供するトランスフォーマーのインターフェースです。
 *
 * @template TChunkInput 入力されるチャンクの型です。
 * @template TChunkOutput 出力されるチャンクの型です。
 *
 * @example
 * ```ts
 * import { type IDecodableStreamTransformer, type ITransformer } from "@unikvs/core";
 *
 * class Compression implements IDecodableStreamTransformer {
 *   public getDecodable(): TransformStream {
 *     return new DecompressionStream("gzip");
 *   }
 * }
 * ```
 */
export interface IDecodableStreamTransformer<TChunkInput = any, TChunkOutput = any> {
  /**
   * デコード処理のための `IDecodable` ストリームインスタンスを返します。
   *
   * @param args ストリーム取得に必要な引数オブジェクトです。
   * @returns デコード可能なストリーム、またはそれを解決する Promise です。
   */
  getDecodable(
    args: ITransformer.GetDecodableArgs,
  ): MaybePromise<IDecodable<TChunkInput, TChunkOutput>>;
}

/**
 * データの双方向（エンコード・デコード）変換を管理する総合トランスフォーマーインターフェースです。
 * ストリームベースの処理と、単発のデータ変換処理の両方をサポートします。
 *
 * @template TEncodeDataInput エンコード入力データの型です。
 * @template TDecodeDataInput デコード入力データの型です。
 * @template TEncodeDataOutput エンコード出力データの型です。
 * @template TDecodeDataOutput デコード出力データの型です。
 * @template TEncodeChunkInput ストリームエンコード時の入力チャンク型です。
 * @template TDecodeChunkInput ストリームデコード時の入力チャンク型です。
 * @template TEncodeChunkOutput ストリームエンコード時の出力チャンク型です。
 * @template TDecodeChunkOutput ストリームデコード時の出力チャンク型です。
 *
 * @example
 * 圧縮トランスフォーマーの実装です。
 *
 * ```ts
 * import type { ITransformer } from "@unikvs/core";
 *
 * class Compression implements ITransformer {
 *   public readonly name = "Compression";
 *   public readonly isOpen = true;
 *
 *   public async encode(
 *     args: Pick<ITransformer.EncodeArgs<Uint8Array<ArrayBuffer>>, "data">,
 *   ): Promise<Uint8Array<ArrayBuffer>> {
 *     const stream = new CompressionStream("gzip");
 *     const body = toReadableStream([args.data]).pipeThrough(stream);
 *     return new Uint8Array(await new Response(body).arrayBuffer());
 *   }
 *
 *   public async decode(
 *     args: Pick<ITransformer.DecodeArgs<Uint8Array<ArrayBuffer>>, "data">,
 *   ): Promise<Uint8Array<ArrayBuffer>> {
 *     const stream = new DecompressionStream("gzip");
 *     const body = toReadableStream([args.data]).pipeThrough(stream);
 *     return new Uint8Array(await new Response(body).arrayBuffer());
 *   }
 *
 *   public getEncodable(): TransformStream {
 *     return new CompressionStream("gzip");
 *   }
 *
 *   public getDecodable(): TransformStream {
 *     return new DecompressionStream("gzip");
 *   }
 * }
 * ```
 *
 * @example
 * 透過的チェックサム検証トランスフォーマーの実装です。
 *
 * ```ts
 * import type { Context, ITransformer } from "@unikvs/core";
 * import { bytesToHex } from "@unikvs/utils";
 *
 * class ChecksumSha256 implements ITransformer {
 *   public readonly name = "ChecksumSha256";
 *   public readonly isOpen = true;
 *
 *   public encode(
 *     args: Pick<ITransformer.EncodeArgs<Uint8Array<ArrayBuffer>>, "context" | "data">,
 *   ): Uint8Array<ArrayBuffer> {
 *     const expected = args.context["@unikvs/checksum:sha256"];
 *     if (typeof expected === "string") {
 *       const actual = bytesToHex(sha256(args.data));
 *       if (actual !== expected) {
 *         throw new Error("Checksum mismatch");
 *       }
 *     }
 *
 *     return args.data;
 *   }
 *
 *   public decode(
 *     args: Pick<ITransformer.DecodeArgs<Uint8Array<ArrayBuffer>>, "context" | "data">,
 *   ): Uint8Array<ArrayBuffer> {
 *     return this.encode(args);
 *   }
 * }
 * ```
 */
export interface ITransformer<
  TEncodeDataInput = any,
  TDecodeDataInput = any,
  TEncodeDataOutput = any,
  TDecodeDataOutput = any,
  TEncodeChunkInput = any,
  TDecodeChunkInput = any,
  TEncodeChunkOutput = any,
  TDecodeChunkOutput = any,
>
  extends
    Partial<IEncodableStreamTransformer<TEncodeChunkInput, TEncodeChunkOutput>>,
    Partial<IDecodableStreamTransformer<TDecodeChunkInput, TDecodeChunkOutput>> {
  /**
   * トランスフォーマーの名前です。デバッグメッセージなどに使用されます。
   */
  readonly name: string;

  /**
   * トランスフォーマーが現在利用可能な状態であるかを示します。
   */
  readonly isOpen: boolean;

  /**
   * トランスフォーマーを使用可能な状態に準備します。
   *
   * リソースの確保や外部接続の初期化などをここで行います。
   *
   * @param args オープンに必要な引数オブジェクトです。
   * @returns 処理の完了を示す Promise、または void です。
   */
  open?(args: ITransformer.OpenArgs): MaybePromise<void>;

  /**
   * トランスフォーマーを安全に停止します。
   *
   * 確保したリソースの解放や、接続の終了処理をここで行います。
   *
   * @param args クローズに必要な引数オブジェクトです。
   * @returns 処理の完了を示す Promise、または void です。
   */
  close?(args: ITransformer.CloseArgs): MaybePromise<void>;

  /**
   * 指定された単一のデータをエンコードして返します。
   *
   * @param args エンコード対象データとコンテキストを含む引数オブジェクトです。
   * @returns エンコードされた結果データ、またはそれを解決する Promise です。
   */
  encode(args: ITransformer.EncodeArgs<TEncodeDataInput>): MaybePromise<TEncodeDataOutput>;

  /**
   * 指定された単一のデータをデコードして返します。
   *
   * @param args デコード対象データとコンテキストを含む引数オブジェクトです。
   * @returns デコードされた結果データ、またはそれを解決する Promise です。
   */
  decode(args: ITransformer.DecodeArgs<TDecodeDataInput>): MaybePromise<TDecodeDataOutput>;
}
