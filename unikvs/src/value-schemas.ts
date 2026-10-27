import type * as v from "./_valibot.js";
import {
  type ValueSchemaInfo,
  type ValueSchemaKind,
  VALUE_SCHEMA_BRAND,
} from "./_value-schemas.js";

/**
 * スキーマ付きの値を表す内部オブジェクトです。
 */
type ValueSchemaDescriptor = ValueSchemaInfo & {
  readonly [VALUE_SCHEMA_BRAND]: true;
};

/**
 * スキーマ情報を内部オブジェクトとして生成します。
 */
function createValueSchemaDescriptor(
  kind: ValueSchemaKind,
  schema: v.GenericSchema,
): ValueSchemaDescriptor {
  return {
    [VALUE_SCHEMA_BRAND]: true,
    kind,
    schema,
  };
}

/**
 * プレーンな値を識別するための固有のシンボルです。
 */
declare const PLAIN_VALUE: unique symbol;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#value-types)
 */
export type PlainValue<TData = any, TInput = TData> = [
  Type: typeof PLAIN_VALUE,
  Data: TData,
  Input: TInput,
];

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#value-types)
 */
export function PlainValue<const TSchema extends v.GenericSchema>(
  schema: TSchema,
): PlainValue<v.InferOutput<TSchema>, v.InferInput<TSchema>> {
  return createValueSchemaDescriptor("plain", schema) as unknown as PlainValue<
    v.InferOutput<TSchema>,
    v.InferInput<TSchema>
  >;
}

/**
 * ストリーム形式の値を識別するための固有のシンボルです。
 */
declare const STREAM_VALUE: unique symbol;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#value-types)
 */
export type StreamValue<TChunkData = any, TChunkInput = TChunkData> = [
  Type: typeof STREAM_VALUE,
  ChunkData: TChunkData,
  ChunkInput: TChunkInput,
];

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#value-types)
 */
export function StreamValue<const TSchema extends v.GenericSchema>(
  schema: TSchema,
): StreamValue<v.InferOutput<TSchema>, v.InferInput<TSchema>> {
  return createValueSchemaDescriptor("stream", schema) as unknown as StreamValue<
    v.InferOutput<TSchema>,
    v.InferInput<TSchema>
  >;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#value-types)
 */
export type Value<TDataAndChunkData = any, TInput = TDataAndChunkData> =
  | PlainValue<TDataAndChunkData, TInput>
  | StreamValue<TDataAndChunkData, TInput>;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#value-types)
 */
export function Value<const TSchema extends v.GenericSchema>(
  schema: TSchema,
): Value<v.InferOutput<TSchema>, v.InferInput<TSchema>> {
  return createValueSchemaDescriptor("any", schema) as unknown as Value<
    v.InferOutput<TSchema>,
    v.InferInput<TSchema>
  >;
}
