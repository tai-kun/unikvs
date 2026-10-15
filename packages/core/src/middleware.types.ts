import type { MaybePromise } from "maypromise";

import type {
  IGetContext,
  IHasContext,
  ISetContext,
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

export namespace IMiddleware {
  export interface INext {
    (): Promise<void>;
  }

  export type MapKeyContext = IMapKeyContext;

  export type OpenContext = IOpenContext;

  export type CloseContext = ICloseContext;

  export type UseContext =
    | ISetContext
    | IGetContext
    | IStreamContext
    | IHasContext
    | IDeleteContext
    | IClearContext;

  export type EncodeContext<TRawData = any, TEncodedData = TRawData> = IEncodeContext<
    TRawData,
    TEncodedData
  >;

  export type DecodeContext<TRawData = any, TDecodedData = TRawData> = IDecodeContext<
    TRawData,
    TDecodedData
  >;

  export type EncodeStreamContext<
    TRawChunk = any,
    TEncodedChunk = TRawChunk,
  > = IEncodeStreamContext<TRawChunk, TEncodedChunk>;

  export type DecodeStreamContext<
    TRawChunk = any,
    TDecodedChunk = TRawChunk,
  > = IDecodeStreamContext<TRawChunk, TDecodedChunk>;
}

export interface IMiddleware<
  TEncodeData = any,
  TDecodeData = any,
  TEncodeChunk = any,
  TDecodeChunk = any,
> {
  readonly name: string;

  readonly isOpen: boolean;

  mapKey?(c: IMiddleware.MapKeyContext): string;

  open?(c: IMiddleware.OpenContext): MaybePromise<void>;

  close?(c: IMiddleware.CloseContext): MaybePromise<void>;

  use?(c: IMiddleware.UseContext, next: IMiddleware.INext): PromiseLike<void>;

  encode?(
    c: IMiddleware.EncodeContext<TEncodeData, TDecodeData>,
    next: IMiddleware.INext,
  ): PromiseLike<void>;

  decode?(
    c: IMiddleware.DecodeContext<TDecodeData, TEncodeData>,
    next: IMiddleware.INext,
  ): PromiseLike<void>;

  encodeStream?(
    c: IMiddleware.EncodeStreamContext<TEncodeChunk, TDecodeChunk>,
    next: IMiddleware.INext,
  ): PromiseLike<void>;

  decodeStream?(
    c: IMiddleware.DecodeStreamContext<TDecodeChunk, TEncodeChunk>,
    next: IMiddleware.INext,
  ): PromiseLike<void>;
}
