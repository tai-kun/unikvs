import type { VariablesInit } from "./_contexts.js";
import type { ValueOf } from "./_types.js";
import type {
  OpenOptionsSchema,
  ClearOptionsSchema,
  CloseOptionsSchema,
} from "./_unikvs.schemas.js";
import type * as v from "./_valibot.js";
import type { $InferPlainValueInput } from "./_value-schemas.js";
import type { KeyValueMapping } from "./unikvs-branch.js";
import type { Value, PlainValue, StreamValue } from "./value-schemas.js";

// -------------------------------------------------------------------------------------------------。
//
// ユーティリティー。
//
// -------------------------------------------------------------------------------------------------。

export type KeyofKeyValueMapping<TKeyValueMapping extends KeyValueMapping = KeyValueMapping> =
  Extract<keyof TKeyValueMapping, string>;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#value-types)
 */
export type SetValue<TValue extends Value> =
  | $InferPlainValueInput<TValue>
  | (TValue extends StreamValue<any, infer TChunkInput> ? ReadableStream<TChunkInput> : never);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#value-types)
 */
export type KeyofKeyValueMappingHasPlainValue<TKeyValueMapping extends KeyValueMapping> = ValueOf<{
  [TKey in KeyofKeyValueMapping<TKeyValueMapping>]: PlainValue extends TKeyValueMapping[TKey]
    ? TKey
    : never;
}>;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#value-types)
 */
export type KeyofKeyValueMappingHasStreamValue<TKeyValueMapping extends KeyValueMapping> = ValueOf<{
  [TKey in KeyofKeyValueMapping<TKeyValueMapping>]: StreamValue extends TKeyValueMapping[TKey]
    ? TKey
    : never;
}>;

// -------------------------------------------------------------------------------------------------。
//
// 型定義。
//
// -------------------------------------------------------------------------------------------------。

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#client-operations)
 */
export type OpenOptions = v.InferInput<typeof OpenOptionsSchema>;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#client-operations)
 */
export type CloseOptions = v.InferInput<typeof CloseOptionsSchema>;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#client-operations)
 */
export type SetOptions<
  TKeyValueMapping extends KeyValueMapping = KeyValueMapping,
  TKey extends KeyofKeyValueMapping<TKeyValueMapping> = KeyofKeyValueMapping<TKeyValueMapping>,
> = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#client-operations)
   */
  readonly key: TKey;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#client-operations)
   */
  readonly value: SetValue<TKeyValueMapping[TKey]>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#variables-and-cancellation)
   */
  readonly signal?: AbortSignal | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#variables-and-cancellation)
   */
  readonly vars?: VariablesInit | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#client-operations)
 */
export type GetOptions<TKey = string> = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#client-operations)
   */
  readonly key: TKey;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#client-operations)
   */
  readonly repair?: boolean | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#client-operations)
   */
  readonly throwOnRepairDenied?: boolean | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#variables-and-cancellation)
   */
  readonly signal?: AbortSignal | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#variables-and-cancellation)
   */
  readonly vars?: VariablesInit | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#value-stream)
 */
export type StreamOptions<TKey = string> = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#value-stream)
   */
  readonly key: TKey;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#value-stream)
   */
  readonly repair?: boolean | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#value-stream)
   */
  readonly throwOnRepairDenied?: boolean | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#variables-and-cancellation)
   */
  readonly signal?: AbortSignal | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#variables-and-cancellation)
   */
  readonly vars?: VariablesInit | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#client-operations)
 */
export type HasOptions<TKey = string> = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#client-operations)
   */
  readonly key: TKey;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#variables-and-cancellation)
   */
  readonly signal?: AbortSignal | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#variables-and-cancellation)
   */
  readonly vars?: VariablesInit | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#client-operations)
 */
export type DeleteOptions<TKey = string> = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#client-operations)
   */
  readonly key: TKey;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#variables-and-cancellation)
   */
  readonly signal?: AbortSignal | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#variables-and-cancellation)
   */
  readonly vars?: VariablesInit | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#client-operations)
 */
export type CopyOptions<TKey = string> = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#client-operations)
   */
  readonly key: TKey;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#client-operations)
   */
  readonly destinationKey: TKey;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#variables-and-cancellation)
   */
  readonly signal?: AbortSignal | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#variables-and-cancellation)
   */
  readonly vars?: VariablesInit | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#client-operations)
 */
export type MoveOptions<TKey = string> = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#client-operations)
   */
  readonly key: TKey;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#client-operations)
   */
  readonly destinationKey: TKey;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#variables-and-cancellation)
   */
  readonly signal?: AbortSignal | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#variables-and-cancellation)
   */
  readonly vars?: VariablesInit | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#client-operations)
 */
export type ClearOptions = v.InferInput<typeof ClearOptionsSchema>;
