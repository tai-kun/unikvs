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
  IDeleteContext,
  IStreamContext,
} from "./pipeline-context.types.js";
import type { IReadableStream, IWritableStream } from "./stream.types.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/storage#contexts)
 */
export namespace IStorage {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#iopencontext)
   */
  export type OpenContext = IOpenContext;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#iclosecontext)
   */
  export type CloseContext = ICloseContext;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#isetcontext)
   */
  export type WriteContext = ISetContext;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#isetcontext)
   */
  export type GetWritableContext = ISetContext;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#igetcontext)
   */
  export type ReadContext = IGetContext;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#istreamcontext)
   */
  export type GetReadableContext = IStreamContext;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#ihascontext)
   */
  export type ExistsContext = IHasContext;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#ideletecontext)
   */
  export type DeleteContext = IDeleteContext;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#icopycontext)
   */
  export type CopyContext = ICopyContext;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#imovecontext)
   */
  export type MoveContext = IMoveContext;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/pipeline-context#iclearcontext)
   */
  export type ClearContext = IClearContext;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/storage#other-write-error)
   */
  // oxlint-disable-next-line typescript/no-duplicate-type-constituents
  export type OtherWriteErrorHandlerContext = WriteContext | GetWritableContext;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/storage#other-write-error)
   */
  export interface IOtherWriteError {
    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core/storage#iotherwriteerror-plugin)
     */
    readonly plugin: "storage";

    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core/storage#iotherwriteerror-errors)
     */
    readonly errors: readonly {
      /**
       * エラーを起こしたプラグイン種別です。
       *
       * 常に `"storage"` です。
       */
      readonly plugin: "storage";

      /**
       * 失敗の原因となった元の値です。
       */
      readonly reason: unknown;
    }[];
  }
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/storage#streams)
 */
export interface IWritableStreamStorage<TChunk = any> {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/storage#streams)
   */
  getWritable(c: IStorage.GetWritableContext): MaybePromise<IWritableStream<TChunk>>;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/storage#streams)
 */
export interface IReadableStreamStorage<TChunk = any> {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/storage#streams)
   */
  getReadable(c: IStorage.GetReadableContext): MaybePromise<IReadableStream<TChunk>>;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/storage#istorage)
 */
export interface IStorage<
  TWriteData = any,
  TReadData = TWriteData,
  TWriteChunk = any,
  TReadChunk = TWriteChunk,
>
  extends
    Partial<IWritableStreamStorage<TWriteChunk>>,
    Partial<IReadableStreamStorage<TReadChunk>> {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/storage#istorage-name)
   */
  readonly name: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/storage#istorage-isopen)
   */
  readonly isOpen: boolean;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/storage#istorage-open)
   */
  open?(c: IStorage.OpenContext): MaybePromise<void>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/storage#istorage-close)
   */
  close?(c: IStorage.CloseContext): MaybePromise<void>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/storage#istorage-write)
   */
  write(c: IStorage.WriteContext, data: TWriteData): MaybePromise<void>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/storage#istorage-read)
   */
  read(c: IStorage.ReadContext): MaybePromise<TReadData>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/storage#istorage-exists)
   */
  exists(c: IStorage.ExistsContext): MaybePromise<boolean>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/storage#istorage-delete)
   */
  delete(c: IStorage.DeleteContext): MaybePromise<void>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/storage#istorage-clear)
   */
  clear(c: IStorage.ClearContext): MaybePromise<void>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/storage#istorage-copy)
   */
  copy(c: IStorage.CopyContext): MaybePromise<void>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/storage#istorage-move)
   */
  move(c: IStorage.MoveContext): MaybePromise<void>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/storage#istorage-onotherwriteerror)
   */
  onOtherWriteError?(
    c: IStorage.OtherWriteErrorHandlerContext,
    errors: readonly IStorage.IOtherWriteError[],
  ): MaybePromise<void>;
}
