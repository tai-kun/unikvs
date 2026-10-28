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
