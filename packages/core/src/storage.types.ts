import type { MaybePromise } from "maypromise";

import type {
  IGetContext,
  IHasContext,
  ISetContext,
  IOpenContext,
  IClearContext,
  ICloseContext,
  IDeleteContext,
  IStreamContext,
} from "./pipeline-context.types.js";
import type { IReadableStream, IWritableStream } from "./stream.types.js";

export namespace IStorage {
  export type OpenContext = IOpenContext;

  export type CloseContext = ICloseContext;

  export type WriteContext = ISetContext;

  export type GetWritableContext = ISetContext;

  export type ReadContext = IGetContext;

  export type GetReadableContext = IStreamContext;

  export type ExistsContext = IHasContext;

  export type DeleteContext = IDeleteContext;

  export type ClearContext = IClearContext;

  // oxlint-disable-next-line typescript/no-duplicate-type-constituents
  export type OtherWriteErrorHandlerContext = WriteContext | GetWritableContext;

  export interface IOtherWriteError {
    readonly plugin: "storage";

    readonly errors: readonly {
      readonly plugin: "storage";

      readonly reason: unknown;
    }[];
  }
}

export interface IWritableStreamStorage<TChunk = any> {
  getWritable(c: IStorage.GetWritableContext): MaybePromise<IWritableStream<TChunk>>;
}

export interface IReadableStreamStorage<TChunk = any> {
  getReadable(c: IStorage.GetReadableContext): MaybePromise<IReadableStream<TChunk>>;
}

export interface IStorage<
  TWriteData = any,
  TReadData = TWriteData,
  TWriteChunk = any,
  TReadChunk = TWriteChunk,
>
  extends
    Partial<IWritableStreamStorage<TWriteChunk>>,
    Partial<IReadableStreamStorage<TReadChunk>> {
  readonly name: string;

  readonly isOpen: boolean;

  open?(c: IStorage.OpenContext): MaybePromise<void>;

  close?(c: IStorage.CloseContext): MaybePromise<void>;

  write(c: IStorage.WriteContext, data: TWriteData): MaybePromise<void>;

  read(c: IStorage.ReadContext): MaybePromise<TReadData>;

  exists(c: IStorage.ExistsContext): MaybePromise<boolean>;

  delete(c: IStorage.DeleteContext): MaybePromise<void>;

  clear(c: IStorage.ClearContext): MaybePromise<void>;

  onOtherWriteError?(
    c: IStorage.OtherWriteErrorHandlerContext,
    errors: readonly IStorage.IOtherWriteError[],
  ): MaybePromise<void>;
}
