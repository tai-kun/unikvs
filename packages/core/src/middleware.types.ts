import type { MaybePromise } from "maypromise";

import type {
  IGetContext,
  IHasContext,
  ISetContext,
  ICopyContext,
  IMoveContext,
  IOpenContext,
  IClearContext,
  ICloseContext,
  IDecodeContext,
  IDeleteContext,
  IEncodeContext,
  IMapKeyContext,
  IStreamContext,
  IDecodeStreamContext,
  IEncodeStreamContext,
} from "./pipeline-context.types.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/middleware#contexts)
 */
export namespace IMiddleware {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/middleware#next)
   */
  export interface INext {
    /**
     * 次の処理を実行します。
     *
     * @returns 完了すると解決する値です。
     */
    (): Promise<void>;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#imapkeycontext)
   */
  export type MapKeyContext = IMapKeyContext;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#iopencontext)
   */
  export type OpenContext = IOpenContext;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#iclosecontext)
   */
  export type CloseContext = ICloseContext;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/middleware#contexts)
   */
  export type UseContext =
    | ISetContext
    | IGetContext
    | IStreamContext
    | IHasContext
    | IDeleteContext
    | ICopyContext
    | IMoveContext
    | IClearContext;

  /**
   * 1 件の宛先で確定した操作の結果です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/middleware#hooks-after-use)
   */
  export type UseTargetOutcome = {
    /**
     * 宛先のプラグイン名です。
     */
    readonly name: string;

    /**
     * 宛先の登録順 (0 起点) です。
     */
    readonly index: number;

    /**
     * 宛先の結果です。`committed` は書き込み・削除などが確定したことを表し、`notFound` は対象のキーが存在しなかったことを表します。
     *
     * `skipped` は将来の操作のために予約されており、現在の UniKvs は実行した宛先についてこの値を返しません。
     */
    readonly status: "committed" | "notFound" | "skipped" | "failed";

    /**
     * 失敗した理由です。`status` が `failed` のときだけ設定されます。
     */
    readonly error?: unknown;
  };

  /**
   * ストレージ I/O が確定した後の操作全体の結果です。
   *
   * `targets` には `committed` の宛先が含まれることがあります。操作が中断された場合や一部の宛先だけ失敗した場合でも、実際に確定した宛先を表します。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/middleware#hooks-after-use)
   */
  export type UseOutcome = {
    /**
     * 操作全体の結果です。
     *
     * `aborted` は操作が中断されたことを表し、中断前にストレージ I/O が確定した宛先は `targets` に `committed` として残ります。
     * 操作全体が成功したかどうかは `status` で、実際に確定した宛先は `targets` で個別に判定してください。
     */
    readonly status: "success" | "error" | "aborted";

    /**
     * 操作全体の失敗理由です。`status` が `success` のときは未設定です。
     */
    readonly error?: unknown;

    /**
     * 宛先ごとの結果です。登録順に保持します。
     */
    readonly targets: readonly UseTargetOutcome[];
  };

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#iencodecontext)
   */
  export type EncodeContext<TRawData = any, TEncodedData = TRawData> = IEncodeContext<
    TRawData,
    TEncodedData
  >;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#idecodecontext)
   */
  export type DecodeContext<TRawData = any, TDecodedData = TRawData> = IDecodeContext<
    TRawData,
    TDecodedData
  >;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#iencodestreamcontext)
   */
  export type EncodeStreamContext<
    TRawChunk = any,
    TEncodedChunk = TRawChunk,
  > = IEncodeStreamContext<TRawChunk, TEncodedChunk>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#idecodestreamcontext)
   */
  export type DecodeStreamContext<
    TRawChunk = any,
    TDecodedChunk = TRawChunk,
  > = IDecodeStreamContext<TRawChunk, TDecodedChunk>;
}

/**
 * 1 件の宛先で確定した操作の結果です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/middleware#hooks-after-use)
 */
type MiddlewareUseTargetOutcome = IMiddleware.UseTargetOutcome;

/**
 * ストレージ I/O が確定した後の操作全体の結果です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/middleware#hooks-after-use)
 */
type MiddlewareUseOutcome = IMiddleware.UseOutcome;

export type { MiddlewareUseOutcome as UseOutcome, MiddlewareUseTargetOutcome as UseTargetOutcome };

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/middleware#hooks)
 */
export interface IMiddleware<
  TEncodeData = any,
  TDecodeData = any,
  TEncodeChunk = any,
  TDecodeChunk = any,
> {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/middleware#identity)
   */
  readonly name: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/middleware#identity)
   */
  readonly isOpen: boolean;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/middleware#hooks-map-key)
   */
  mapKey?(c: IMiddleware.MapKeyContext): string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/middleware#hooks)
   */
  open?(c: IMiddleware.OpenContext): MaybePromise<void>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/middleware#hooks)
   */
  close?(c: IMiddleware.CloseContext): MaybePromise<void>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/middleware#hooks-use)
   */
  use?(c: IMiddleware.UseContext, next: IMiddleware.INext): PromiseLike<void>;

  /**
   * ストレージ I/O が確定した後に呼ばれる通知専用のフックです。
   *
   * 書き込み系の操作 (`set`・`delete`・`copy`・`move`・`clear`) で、すべての宛先の処理が確定した後に 1 回だけ呼ばれます。
   * キーロックと I/O ロックを保持したまま実行されるため、後続の操作からは完了後の状態として観測されます。
   * 操作の結果は変更できません。このフックが投げた例外はログに記録され、操作の結果を置き換えません。
   * `outcome.targets` には `committed` の宛先が含まれることがあり、操作が中断された場合でも実際に確定した宛先を表します。
   * 読み取り系の操作 (`get`・`stream`・`has`) では呼ばれません。`get`・`stream` の `repair` による書き戻しも読み取りの一部として扱われ、`afterUse` は呼ばれません。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/middleware#hooks-after-use)
   */
  afterUse?(c: IMiddleware.UseContext, outcome: IMiddleware.UseOutcome): MaybePromise<void>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/middleware#hooks-encode-decode)
   */
  encode?(
    c: IMiddleware.EncodeContext<TEncodeData, TDecodeData>,
    next: IMiddleware.INext,
  ): PromiseLike<void>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/middleware#hooks-encode-decode)
   */
  decode?(
    c: IMiddleware.DecodeContext<TDecodeData, TEncodeData>,
    next: IMiddleware.INext,
  ): PromiseLike<void>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/middleware#hooks-encode-decode-stream)
   */
  encodeStream?(
    c: IMiddleware.EncodeStreamContext<TEncodeChunk, TDecodeChunk>,
    next: IMiddleware.INext,
  ): PromiseLike<void>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/middleware#hooks-encode-decode-stream)
   */
  decodeStream?(
    c: IMiddleware.DecodeStreamContext<TDecodeChunk, TEncodeChunk>,
    next: IMiddleware.INext,
  ): PromiseLike<void>;
}
