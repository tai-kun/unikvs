import type { MaybePromise } from "maypromise";

import type { ErrorBase } from "./errors.js";
import type { Variables } from "./variables.types.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage)
 */
export namespace IStorage {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-crud)
   */
  export type Key = string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-streams)
   */
  export type GetWritableArgs = {
    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-streams)
     */
    vars: Variables;

    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-streams)
     */
    key: Key;

    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-streams)
     */
    signal: AbortSignal;
  };

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-streams)
   */
  export type GetReadableArgs = {
    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-streams)
     */
    vars: Variables;

    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-streams)
     */
    key: Key;

    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-streams)
     */
    signal: AbortSignal;
  };

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-lifecycle)
   */
  export type OpenArgs = {
    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-lifecycle)
     */
    vars: Variables;

    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-lifecycle)
     */
    signal: AbortSignal;
  };

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-lifecycle)
   */
  export type CloseArgs = {
    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-lifecycle)
     */
    vars: Variables;

    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-lifecycle)
     */
    signal: AbortSignal;
  };

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-lifecycle)
   */
  export type OnOtherWriteErrorArgs = {
    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-lifecycle)
     */
    vars: Variables;

    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-lifecycle)
     */
    key: Key;

    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-lifecycle)
     */
    error: ErrorBase<{
      readonly plugin: "storage";
      readonly action: "write";
      readonly errors: readonly {
        readonly plugin: "storage";
        readonly reason: unknown;
      }[];
    }>;

    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-lifecycle)
     */
    signal: AbortSignal;
  };

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-crud)
   */
  export type WriteArgs<TData = any> = {
    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-crud)
     */
    vars: Variables;

    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-crud)
     */
    key: Key;

    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-crud)
     */
    data: TData;

    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-crud)
     */
    signal: AbortSignal;
  };

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-crud)
   */
  export type ReadArgs = {
    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-crud)
     */
    vars: Variables;

    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-crud)
     */
    key: Key;

    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-crud)
     */
    signal: AbortSignal;
  };

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-crud)
   */
  export type ExistsArgs = {
    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-crud)
     */
    vars: Variables;

    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-crud)
     */
    key: Key;

    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-crud)
     */
    signal: AbortSignal;
  };

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-crud)
   */
  export type DeleteArgs = {
    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-crud)
     */
    vars: Variables;

    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-crud)
     */
    key: Key;

    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-crud)
     */
    signal: AbortSignal;
  };

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-crud)
   */
  export type ClearArgs = {
    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-crud)
     */
    vars: Variables;

    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-crud)
     */
    signal: AbortSignal;
  };
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-streams)
 */
export interface IWritableStream<TData = any> extends WritableStream<TData> {}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-streams)
 */
export interface IWritableStreamStorage<TData = any> {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-streams)
   */
  getWritable(args: IStorage.GetWritableArgs): MaybePromise<IWritableStream<TData>>;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-streams)
 */
export interface IReadableStream<TData = any> extends ReadableStream<TData> {}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-streams)
 */
export interface IReadableStreamStorage<TData = any> {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-streams)
   */
  getReadable(args: IStorage.GetReadableArgs): MaybePromise<IReadableStream<TData>>;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage)
 */
export interface IStorage<
  TWriteDataInput = any,
  TReadDataOutput = TWriteDataInput,
  TWriteChunkInput = TWriteDataInput extends ArrayBufferLike | ArrayBufferView
    ? TWriteDataInput
    : any,
  TReadChunkOutput = TWriteChunkInput,
>
  extends
    Partial<IWritableStreamStorage<TWriteChunkInput>>,
    Partial<IReadableStreamStorage<TReadChunkOutput>> {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage)
   */
  readonly name: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage)
   */
  readonly isOpen: boolean;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-lifecycle)
   */
  open?(args: IStorage.OpenArgs): MaybePromise<void>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-lifecycle)
   */
  close?(args: IStorage.CloseArgs): MaybePromise<void>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-lifecycle)
   */
  onOtherWriteError?(args: IStorage.OnOtherWriteErrorArgs): MaybePromise<void>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-crud)
   */
  write(args: IStorage.WriteArgs<TWriteDataInput>): MaybePromise<void>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-crud)
   */
  read(args: IStorage.ReadArgs): MaybePromise<TReadDataOutput>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-crud)
   */
  exists(args: IStorage.ExistsArgs): MaybePromise<boolean>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-crud)
   */
  delete(args: IStorage.DeleteArgs): MaybePromise<void>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-crud)
   */
  clear(args: IStorage.ClearArgs): MaybePromise<void>;
}
