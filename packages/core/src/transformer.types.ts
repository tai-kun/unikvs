import type { MaybePromise } from "maypromise";

import type { default as Variables } from "./variables.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer)
 */
export namespace ITransformer {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer-streams)
   */
  export type GetEncodableArgs = {
    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer-streams)
     */
    vars: Variables;

    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer-streams)
     */
    signal: AbortSignal;
  };

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer-streams)
   */
  export type GetDecodableArgs = {
    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer-streams)
     */
    vars: Variables;

    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer-streams)
     */
    signal: AbortSignal;
  };

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer-lifecycle)
   */
  export type OpenArgs = {
    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer-lifecycle)
     */
    vars: Variables;

    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer-lifecycle)
     */
    signal: AbortSignal;
  };

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer-lifecycle)
   */
  export type CloseArgs = {
    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer-lifecycle)
     */
    vars: Variables;

    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer-lifecycle)
     */
    signal: AbortSignal;
  };

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer-once)
   */
  export type EncodeArgs<TData = any> = {
    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer-once)
     */
    vars: Variables;

    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer-once)
     */
    data: TData;

    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer-once)
     */
    signal: AbortSignal;
  };

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer-once)
   */
  export type DecodeArgs<TData = any> = {
    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer-once)
     */
    vars: Variables;

    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer-once)
     */
    data: TData;

    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer-once)
     */
    signal: AbortSignal;
  };

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer)
   */
  export type MapKeyArgs = {
    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer)
     */
    vars: Variables;

    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer)
     */
    key: string;

    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer)
     */
    signal: AbortSignal;
  };

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer)
   */
  export type ClearHookArgs = {
    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer)
     */
    vars: Variables;

    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer)
     */
    signal: AbortSignal;
  };

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer)
   */
  export type ExistsHookArgs = {
    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer)
     */
    vars: Variables;

    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer)
     */
    key: string;

    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer)
     */
    signal: AbortSignal;
  };

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer)
   */
  export type DeleteHookArgs = {
    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer)
     */
    vars: Variables;

    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer)
     */
    key: string;

    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer)
     */
    signal: AbortSignal;
  };
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer-streams)
 */
export interface IEncodable<TChunkInput = any, TChunkOutput = any> extends TransformStream<
  TChunkInput,
  TChunkOutput
> {}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer-streams)
 */
export interface IEncodableStreamTransformer<TChunkInput = any, TChunkOutput = any> {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer-streams)
   */
  getEncodable(
    args: ITransformer.GetEncodableArgs,
  ): MaybePromise<IEncodable<TChunkInput, TChunkOutput>>;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer-streams)
 */
export interface IDecodable<TChunkInput = any, TChunkOutput = any> extends TransformStream<
  TChunkInput,
  TChunkOutput
> {}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer-streams)
 */
export interface IDecodableStreamTransformer<TChunkInput = any, TChunkOutput = any> {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer-streams)
   */
  getDecodable(
    args: ITransformer.GetDecodableArgs,
  ): MaybePromise<IDecodable<TChunkInput, TChunkOutput>>;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer)
 */
export interface IKeyMappableTransformer {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer)
   */
  mapKey(args: ITransformer.MapKeyArgs): MaybePromise<string>;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer)
 */
export interface ITransformerHooks {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer)
   */
  onExists(args: ITransformer.ExistsHookArgs): MaybePromise<void>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer)
   */
  onDelete(args: ITransformer.DeleteHookArgs): MaybePromise<void>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer)
   */
  onClear(args: ITransformer.ClearHookArgs): MaybePromise<void>;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer)
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
    Partial<IDecodableStreamTransformer<TDecodeChunkInput, TDecodeChunkOutput>>,
    Partial<IKeyMappableTransformer>,
    Partial<ITransformerHooks> {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer)
   */
  readonly name: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer)
   */
  readonly isOpen: boolean;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer-lifecycle)
   */
  open?(args: ITransformer.OpenArgs): MaybePromise<void>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer-lifecycle)
   */
  close?(args: ITransformer.CloseArgs): MaybePromise<void>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer-once)
   */
  encode(args: ITransformer.EncodeArgs<TEncodeDataInput>): MaybePromise<TEncodeDataOutput>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#transformer-once)
   */
  decode(args: ITransformer.DecodeArgs<TDecodeDataInput>): MaybePromise<TDecodeDataOutput>;
}
