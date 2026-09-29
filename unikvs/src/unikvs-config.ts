import type {
  IStorage,
  Variables,
  ITransformer,
  IReadableStreamStorage,
  IWritableStreamStorage,
  IDecodableStreamTransformer,
  IEncodableStreamTransformer,
} from "@unikvs/core";

import UniKvsStorage from "./_storage.js";
import UniKvsTransformer from "./_transformer.js";
import * as v from "./_valibot.js";
import {
  type Value,
  type UniKvsSchema,
  type $InferPlainValueData,
  type IValueSchemaResolver,
  type $InferStreamValueChunkData,
  UniKvsSchemaSchema,
  createValueSchemaResolver,
} from "./_value-schemas.js";
import { MissingStorageError } from "./errors.js";
import type UniKvs from "./unikvs.js";
import type { ValueOf } from "./utils.types.js";
import type { VariablesSource } from "./variables.types.js";

export {
  type UniKvsSchema,
  type ValueSchemaInfo,
  type UniKvsSchemaRecord,
  type UniKvsSchemaEntries,
  type $InferPlainValueData,
  type IValueSchemaResolver,
  type $InferKeyValueMapping,
  type $InferPlainValueInput,
  type $InferStreamValueChunkData,
  type $InferStreamValueChunkInput,
  Value,
  PlainValue,
  StreamValue,
} from "./_value-schemas.js";

/**
 * トランスフォーマーから、デコード時の入力データの型を推論するユーティリティー型です。
 *
 * @template TTransformer 対象となるトランスフォーマーの型です。
 */
type $InferDecodeDataInput<TTransformer extends ITransformer> =
  TTransformer extends ITransformer<any, infer TDecodeDataInput> ? TDecodeDataInput : never;

/**
 * トランスフォーマーから、エンコード時の出力データの型を推論するユーティリティー型です。
 *
 * @template TTransformer 対象となるトランスフォーマーの型です。
 */
type $InferEncodeDataOutput<TTransformer extends ITransformer> =
  TTransformer extends ITransformer<any, any, infer TEncodeDataOutput> ? TEncodeDataOutput : never;

/**
 * トランスフォーマーから、デコードストリームの入力チャンクデータの型を推論するユーティリティー型です。
 *
 * @template TTransformer 対象となるトランスフォーマーの型です。
 */
type $InferDecodeChunkInput<TTransformer extends ITransformer> =
  TTransformer extends IDecodableStreamTransformer<infer TDecodeChunkInput>
    ? TDecodeChunkInput
    : never;

/**
 * トランスフォーマーから、エンコードストリームの出力チャンクデータの型を推論するユーティリティー型です。
 *
 * @template TTransformer 対象となるトランスフォーマーの型です。
 */
type $InferEncodeChunkOutput<TTransformer extends ITransformer> =
  TTransformer extends IEncodableStreamTransformer<any, infer TEncodeChunkOutput>
    ? TEncodeChunkOutput
    : never;

/**
 * ストレージから、書き込みストリームの入力チャンクデータの型を推論するユーティリティー型です。
 *
 * @template TStorage 対象となるストレージの型です。
 */
type $InferWriteChunkInput<TStorage extends IStorage> =
  TStorage extends IWritableStreamStorage<infer TWriteChunkInput> ? TWriteChunkInput : never;

/**
 * ストレージから、読み込みストリームの出力チャンクデータの型を推論するユーティリティー型です。
 *
 * @template TStorage 対象となるストレージの型です。
 */
type $InferReadChunkOutput<TStorage extends IStorage> =
  TStorage extends IReadableStreamStorage<infer TReadChunkOutput> ? TReadChunkOutput : never;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#value-types)
 */
export type KeyValueMapping<T = any> = { readonly [key: IStorage.Key]: Value<T> };

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#value-types)
 */
export type KeyofKeyValueMapping<TKeyValueMapping extends KeyValueMapping = KeyValueMapping> =
  Extract<keyof TKeyValueMapping, IStorage.Key>;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#config-builder)
 */
export interface IUniKvsConfigBuilder<
  TKeyValueMapping extends KeyValueMapping = KeyValueMapping,
  TUniKvsDataInput = ValueOf<{
    [TKey in KeyofKeyValueMapping<TKeyValueMapping>]: $InferPlainValueData<TKeyValueMapping[TKey]>;
  }>,
  TUniKvsDataOutput = TUniKvsDataInput,
  TUniKvsChunkInput = ValueOf<{
    [TKey in KeyofKeyValueMapping<TKeyValueMapping>]: $InferStreamValueChunkData<
      TKeyValueMapping[TKey]
    >;
  }>,
  TUniKvsChunkOutput = TUniKvsChunkInput,
  TLastTransformerDecodeDataInput = TUniKvsDataOutput,
  TLastTransformerEncodeDataOutput = TUniKvsDataInput,
  TLastTransformerDecodeChunkInput = TUniKvsChunkOutput,
  TLastTransformerEncodeChunkOutput = TUniKvsChunkInput,
> {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#config-builder)
   */
  setVariables(vars: VariablesSource): this;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#config-builder)
   */
  appendStorage<
    TStorage extends IStorage<
      [TLastTransformerEncodeDataOutput] extends [never] ? any : TLastTransformerEncodeDataOutput,
      [TLastTransformerDecodeDataInput] extends [never] ? any : TLastTransformerDecodeDataInput,
      [TLastTransformerEncodeChunkOutput] extends [never] ? any : TLastTransformerEncodeChunkOutput,
      [TLastTransformerDecodeChunkInput] extends [never] ? any : TLastTransformerDecodeChunkInput
    >,
  >(
    storage: TStorage,
  ): IUniKvsConfigFinalizer<
    TKeyValueMapping,
    TLastTransformerEncodeDataOutput,
    TLastTransformerDecodeDataInput,
    [TLastTransformerEncodeChunkOutput] extends [never]
      ? never
      : [$InferWriteChunkInput<TStorage>] extends [never]
        ? never
        : TLastTransformerEncodeChunkOutput,
    [TLastTransformerDecodeChunkInput] extends [never]
      ? never
      : [$InferReadChunkOutput<TStorage>] extends [never]
        ? never
        : TLastTransformerDecodeChunkInput,
    TLastTransformerDecodeDataInput,
    TLastTransformerEncodeDataOutput,
    TLastTransformerDecodeChunkInput,
    TLastTransformerEncodeChunkOutput
  >;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#config-builder)
   */
  appendTransformer<
    TTransformer extends ITransformer<
      // 最後のトランスファーマーのエンコード出力を、入力値として受け入れられる必要があります。
      [TLastTransformerEncodeDataOutput] extends [never] ? any : TLastTransformerEncodeDataOutput,
      // ここではまだ、後段のトランスフォーマーのデコード出力を気にしません。
      any,
      // ここではまだ、後段のトランスフォーマーのエンコード入力を気にしません。
      any,
      // 最後のトランスフォーマーのデコード入力を出力する必要があります。
      [TLastTransformerDecodeDataInput] extends [never] ? any : TLastTransformerDecodeDataInput,
      // 最後のトランスファーマーのエンコード出力を、入力値として受け入れられる必要があります。
      [TLastTransformerEncodeChunkOutput] extends [never] ? any : TLastTransformerEncodeChunkOutput,
      // ここではまだ、後段のトランスフォーマーのデコード出力を気にしません。
      any,
      // ここではまだ、後段のトランスフォーマーのエンコード入力を気にしません。
      any,
      // 最後のトランスフォーマーのデコード入力を出力する必要があります。
      [TLastTransformerDecodeChunkInput] extends [never] ? any : TLastTransformerDecodeChunkInput
    >,
  >(
    transformer: TTransformer,
  ): IUniKvsConfigBuilder<
    TKeyValueMapping,
    TUniKvsDataInput,
    TUniKvsDataOutput,
    [TUniKvsChunkInput] extends [never]
      ? never
      : [$InferDecodeChunkInput<TTransformer>] extends [never]
        ? never
        : TUniKvsChunkInput,
    [TUniKvsChunkOutput] extends [never]
      ? never
      : [$InferEncodeChunkOutput<TTransformer>] extends [never]
        ? never
        : TUniKvsChunkOutput,
    $InferDecodeDataInput<TTransformer>,
    $InferEncodeDataOutput<TTransformer>,
    $InferDecodeChunkInput<TTransformer>,
    $InferEncodeChunkOutput<TTransformer>
  >;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#config-builder)
 */
export interface IUniKvsConfigFinalizer<
  TKeyValueMapping extends KeyValueMapping = KeyValueMapping,
  TWriteDataInput = any,
  TReadDataOutput = any,
  TWriteChunkInput = any,
  TReadChunkOutput = any,
  TLastTransformerDecodeDataInput = TReadDataOutput,
  TLastTransformerEncodeDataOutput = TWriteDataInput,
  TLastTransformerDecodeChunkInput = TReadChunkOutput,
  TLastTransformerEncodeChunkOutput = TWriteChunkInput,
> {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#config-builder)
   */
  create(): UniKvs<TKeyValueMapping>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#config-builder)
   */
  setVariables(vars: VariablesSource): this;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#config-builder)
   */
  appendStorage<
    TStorage extends IStorage<
      [TLastTransformerEncodeDataOutput] extends [never] ? any : TLastTransformerEncodeDataOutput,
      [TLastTransformerDecodeDataInput] extends [never] ? any : TLastTransformerDecodeDataInput,
      [TLastTransformerEncodeChunkOutput] extends [never] ? any : TLastTransformerEncodeChunkOutput,
      [TLastTransformerDecodeChunkInput] extends [never] ? any : TLastTransformerDecodeChunkInput
    >,
  >(
    storage: TStorage,
  ): IUniKvsConfigFinalizer<
    TKeyValueMapping,
    TWriteDataInput,
    TReadDataOutput,
    [TWriteChunkInput] extends [never]
      ? never
      : [$InferWriteChunkInput<TStorage>] extends [never]
        ? never
        : TWriteChunkInput,
    [TReadChunkOutput] extends [never]
      ? never
      : [$InferReadChunkOutput<TStorage>] extends [never]
        ? never
        : TReadChunkOutput,
    TLastTransformerDecodeDataInput,
    TLastTransformerEncodeDataOutput,
    TLastTransformerDecodeChunkInput,
    TLastTransformerEncodeChunkOutput
  >;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#config-builder)
   */
  appendTransformer<
    TTransformer extends ITransformer<
      [TLastTransformerEncodeDataOutput] extends [never] ? any : TLastTransformerEncodeDataOutput,
      any,
      any,
      [TLastTransformerDecodeDataInput] extends [never] ? any : TLastTransformerDecodeDataInput,
      [TLastTransformerEncodeChunkOutput] extends [never] ? any : TLastTransformerEncodeChunkOutput,
      any,
      any,
      [TLastTransformerDecodeChunkInput] extends [never] ? any : TLastTransformerDecodeChunkInput
    >,
  >(
    transformer: TTransformer,
  ): IUniKvsConfigFinalizer<
    TKeyValueMapping,
    TWriteDataInput,
    TReadDataOutput,
    TWriteChunkInput,
    TReadChunkOutput,
    $InferDecodeDataInput<TTransformer>,
    $InferEncodeDataOutput<TTransformer>,
    $InferDecodeChunkInput<TTransformer>,
    $InferEncodeChunkOutput<TTransformer>
  >;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#config-builder)
 */
export type UniKvsConfigOptions = {
  /**
   * キーと値のスキーマ定義です。指定すると入出力値が検証されます。
   */
  readonly schema?: UniKvsSchema | undefined;
};

const UniKvsConfigOptionsSchema = v.object({
  /**
   * キーと値のスキーマ定義です。
   */
  schema: v.optional(UniKvsSchemaSchema),
});

const UniKvsConfigArgsSchema = v.tuple([v.optional(UniKvsConfigOptionsSchema)]);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#config-builder)
 */
export default class UniKvsConfig implements IUniKvsConfigBuilder, IUniKvsConfigFinalizer {
  /**
   * UniKvs のコンストラクターです。
   */
  readonly #UniKvs: typeof UniKvs;

  /**
   * アプリケーションの実行時情報を保持する変数オブジェクトです。
   */
  #vars: Variables;

  /**
   * データの永続化先となるストレージのリストです。各ストレージは登録時点のトランスフォーマー数を保持します。
   */
  readonly #destinations: { readonly storage: IStorage; readonly transformerCount: number }[];

  /**
   * データを変換するためのトランスフォーマーのリストです。登録順に保持します。
   */
  readonly #transformers: ITransformer[];

  /**
   * キーに対応する値のスキーマ情報を解決するリゾルバーです。スキーマ未設定時は null となります。
   */
  readonly #valueSchemaResolver: IValueSchemaResolver | null;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#config-builder)
   */
  public constructor(UniKvsConstructor: typeof UniKvs, options?: UniKvsConfigOptions) {
    const [parsed = {}] = v.parseInput(UniKvsConfigArgsSchema, [options]);

    this.#UniKvs = UniKvsConstructor;
    this.#vars = {};
    this.#destinations = [];
    this.#transformers = [];
    this.#valueSchemaResolver = parsed.schema ? createValueSchemaResolver(parsed.schema) : null;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#config-builder)
   */
  public create(): UniKvs {
    const transformers = this.#transformers.map((tf) => new UniKvsTransformer(tf));

    const [first, ...rest] = this.#destinations.map(({ storage, transformerCount }) => ({
      storage: new UniKvsStorage(storage),
      transformers: transformers.slice(0, transformerCount),
    }));

    // ストレージが空の場合は UniKvs として機能できないため、例外を投げます。
    if (!first) {
      throw new MissingStorageError();
    }

    // 変数の参照を切り離すために浅いコピーを作成して UniKvs を初期化します。
    return new this.#UniKvs(this.#vars, [first, ...rest], transformers, this.#valueSchemaResolver);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#config-builder)
   */
  public setVariables(vars: VariablesSource): this {
    this.#vars = Array.isArray(vars) ? Object.fromEntries(vars) : { ...vars };

    return this;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#config-builder)
   */
  public appendStorage(storage: IStorage): this {
    this.#destinations.push({ storage, transformerCount: this.#transformers.length });

    return this;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#config-builder)
   */
  public appendTransformer(transformer: ITransformer): this {
    this.#transformers.push(transformer);

    return this;
  }
}
