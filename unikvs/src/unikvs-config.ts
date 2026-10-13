import type {
  IStorage,
  ITransformer,
  IReadableStreamStorage,
  IWritableStreamStorage,
  IDecodableStreamTransformer,
  IEncodableStreamTransformer,
} from "@unikvs/core";
import { Variables } from "@unikvs/core";

import { PipelineGraph } from "./_pipeline-graph.js";
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
  TTransformer extends ITransformer<any, infer TDecodeDataInput, any, any, any, any, any, any>
    ? TDecodeDataInput
    : never;

/**
 * トランスフォーマーから、エンコード時の出力データの型を推論するユーティリティー型です。
 *
 * @template TTransformer 対象となるトランスフォーマーの型です。
 */
type $InferEncodeDataOutput<TTransformer extends ITransformer> =
  TTransformer extends ITransformer<any, any, infer TEncodeDataOutput, any, any, any, any, any>
    ? TEncodeDataOutput
    : never;

/**
 * トランスフォーマーから、エンコード時の入力データの型を推論するユーティリティー型です。
 * 分岐先頭の親出力受容検査に使用します。
 *
 * @template TTransformer 対象となるトランスフォーマーの型です。
 */
type $InferEncodeDataInput<TTransformer extends ITransformer> =
  TTransformer extends ITransformer<infer TEncodeDataInput, any, any, any, any, any, any, any>
    ? TEncodeDataInput
    : never;

/**
 * トランスフォーマーから、デコード時の出力データの型を推論するユーティリティー型です。
 * 分岐先頭の親入力受容検査に使用します。
 *
 * @template TTransformer 対象となるトランスフォーマーの型です。
 */
type $InferDecodeDataOutput<TTransformer extends ITransformer> =
  TTransformer extends ITransformer<any, any, any, infer TDecodeDataOutput, any, any, any, any>
    ? TDecodeDataOutput
    : never;

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
 * トランスフォーマーから、エンコードストリームの入力チャンクデータの型を推論するユーティリティー型です。
 * 分岐先頭のチャンク検査に使用します。
 *
 * @template TTransformer 対象となるトランスフォーマーの型です。
 */
type $InferEncodeChunkInput<TTransformer extends ITransformer> =
  TTransformer extends IEncodableStreamTransformer<infer TEncodeChunkInput, any>
    ? TEncodeChunkInput
    : never;

/**
 * トランスフォーマーから、デコードストリームの出力チャンクデータの型を推論するユーティリティー型です。
 * 分岐先頭のチャンク検査に使用します。
 *
 * @template TTransformer 対象となるトランスフォーマーの型です。
 */
type $InferDecodeChunkOutput<TTransformer extends ITransformer> =
  TTransformer extends IDecodableStreamTransformer<any, infer TDecodeChunkOutput>
    ? TDecodeChunkOutput
    : never;

/**
 * ストレージから、書き込みデータの入力型を推論するユーティリティー型です。
 * 分岐先頭の親出力受容検査に使用します。
 *
 * @template TStorage 対象となるストレージの型です。
 */
type $InferWriteDataInput<TStorage extends IStorage> =
  TStorage extends IStorage<infer TWriteDataInput, any, any, any> ? TWriteDataInput : never;

/**
 * ストレージから、読み込みデータの出力型を推論するユーティリティー型です。
 * 分岐先頭の親入力受容検査に使用します。
 *
 * @template TStorage 対象となるストレージの型です。
 */
type $InferReadDataOutput<TStorage extends IStorage> =
  TStorage extends IStorage<any, infer TReadDataOutput, any, any> ? TReadDataOutput : never;

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
 * `any` かどうかを判定するユーティリティー型です。
 * 分岐先頭の空判定で `any` を `unknown` と区別するために使用します。
 *
 * @template T 判定する型です。
 */
type $IsAny<T> = 0 extends 1 & T ? true : false;

/**
 * `unknown` かどうかを判定するユーティリティー型です。
 * 空ブランチの先頭マーカー検出に使用します。
 *
 * @template T 判定する型です。
 */
type $IsUnknown<T> =
  $IsAny<T> extends true
    ? false
    : [T] extends [unknown]
      ? [unknown] extends [T]
        ? true
        : false
      : false;

/**
 * `never` かどうかを判定するユーティリティー型です。
 * チャンクの非対応判定に使用します。
 *
 * @template T 判定する型です。
 */
type $IsNever<T> = [T] extends [never] ? true : false;

/**
 * 親出力が分岐先頭のエンコード入力を受容できるかを検査するユーティリティー型です。
 * 不適合時は `never` を返し、`fork` 引数を `never` 化して型エラーを発生させます。
 * 先頭のみを検査します。
 * 中間以降は検査しません。
 *
 * @template TParentOutput 親の現出力型です。
 * @template TBranchHeadInput 分岐先頭の入力型です。
 */
type $CheckForkEncodeData<TParentOutput, TBranchHeadInput> =
  $IsUnknown<TBranchHeadInput> extends true
    ? unknown
    : $IsAny<TBranchHeadInput> extends true
      ? unknown
      : $IsAny<TParentOutput> extends true
        ? unknown
        : [TParentOutput] extends [TBranchHeadInput]
          ? unknown
          : never;

/**
 * 分岐先頭のデコード出力が親入力を受容できるかを検査するユーティリティー型です。
 * 不適合時は `never` を返します。
 * 先頭のみを検査します。
 * 中間以降は検査しません。
 *
 * @template TParentInput 親の現入力型です。
 * @template TBranchHeadOutput 分岐先頭の出力型です。
 */
type $CheckForkDecodeData<TParentInput, TBranchHeadOutput> =
  $IsUnknown<TBranchHeadOutput> extends true
    ? unknown
    : $IsAny<TBranchHeadOutput> extends true
      ? unknown
      : $IsAny<TParentInput> extends true
        ? unknown
        : [TBranchHeadOutput] extends [TParentInput]
          ? unknown
          : never;

/**
 * 親チャンク出力が分岐先頭チャンク入力を受容できるかを検査するユーティリティー型です。
 * ストリーム非対応の `never` は許容します。
 * 先頭のみを検査します。
 * 中間以降は検査しません。
 *
 * @template TParentOutput 親の現チャンク出力型です。
 * @template TBranchHeadInput 分岐先頭のチャンク入力型です。
 */
type $CheckForkEncodeChunk<TParentOutput, TBranchHeadInput> =
  $IsUnknown<TBranchHeadInput> extends true
    ? unknown
    : $IsAny<TBranchHeadInput> extends true
      ? unknown
      : $IsAny<TParentOutput> extends true
        ? unknown
        : $IsUnknown<TParentOutput> extends true
          ? unknown
          : $IsNever<TParentOutput> extends true
            ? unknown
            : $IsNever<TBranchHeadInput> extends true
              ? unknown
              : [TParentOutput] extends [TBranchHeadInput]
                ? unknown
                : never;

/**
 * 分岐先頭チャンク出力が親チャンク入力を受容できるかを検査するユーティリティー型です。
 * ストリーム非対応の `never` は許容します。
 * 先頭のみを検査します。
 * 中間以降は検査しません。
 *
 * @template TParentInput 親の現チャンク入力型です。
 * @template TBranchHeadOutput 分岐先頭のチャンク出力型です。
 */
type $CheckForkDecodeChunk<TParentInput, TBranchHeadOutput> =
  $IsUnknown<TBranchHeadOutput> extends true
    ? unknown
    : $IsAny<TBranchHeadOutput> extends true
      ? unknown
      : $IsAny<TParentInput> extends true
        ? unknown
        : $IsUnknown<TParentInput> extends true
          ? unknown
          : $IsNever<TParentInput> extends true
            ? unknown
            : $IsNever<TBranchHeadOutput> extends true
              ? unknown
              : [TBranchHeadOutput] extends [TParentInput]
                ? unknown
                : never;

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
export interface IUniKvsBranch<
  TKeyValueMapping extends KeyValueMapping = KeyValueMapping,
  TBranchChunkInput = any,
  TBranchChunkOutput = any,
  THeadEncodeDataInput = unknown,
  THeadDecodeDataOutput = unknown,
  THeadEncodeChunkInput = unknown,
  THeadDecodeChunkOutput = unknown,
  TLastDecodeDataInput = any,
  TLastEncodeDataOutput = any,
  TLastDecodeChunkInput = any,
  TLastEncodeChunkOutput = any,
  TBranchHasPersist extends boolean = false,
> {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#config-builder)
   */
  connect<
    TTransformer extends ITransformer<
      [TLastEncodeDataOutput] extends [never] ? any : TLastEncodeDataOutput,
      any,
      any,
      [TLastDecodeDataInput] extends [never] ? any : TLastDecodeDataInput,
      [TLastEncodeChunkOutput] extends [never] ? any : TLastEncodeChunkOutput,
      any,
      any,
      [TLastDecodeChunkInput] extends [never] ? any : TLastDecodeChunkInput
    >,
  >(
    transformer: TTransformer,
  ): IUniKvsBranch<
    TKeyValueMapping,
    [TBranchChunkInput] extends [never]
      ? never
      : [$InferDecodeChunkInput<TTransformer>] extends [never]
        ? never
        : TBranchChunkInput,
    [TBranchChunkOutput] extends [never]
      ? never
      : [$InferEncodeChunkOutput<TTransformer>] extends [never]
        ? never
        : TBranchChunkOutput,
    $IsUnknown<THeadEncodeDataInput> extends true
      ? $InferEncodeDataInput<TTransformer>
      : THeadEncodeDataInput,
    $IsUnknown<THeadDecodeDataOutput> extends true
      ? $InferDecodeDataOutput<TTransformer>
      : THeadDecodeDataOutput,
    $IsUnknown<THeadEncodeChunkInput> extends true
      ? $InferEncodeChunkInput<TTransformer>
      : THeadEncodeChunkInput,
    $IsUnknown<THeadDecodeChunkOutput> extends true
      ? $InferDecodeChunkOutput<TTransformer>
      : THeadDecodeChunkOutput,
    $InferDecodeDataInput<TTransformer>,
    $InferEncodeDataOutput<TTransformer>,
    $InferDecodeChunkInput<TTransformer>,
    $InferEncodeChunkOutput<TTransformer>,
    TBranchHasPersist
  >;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#config-builder)
   */
  persist<
    TStorage extends IStorage<
      [TLastEncodeDataOutput] extends [never] ? any : TLastEncodeDataOutput,
      [TLastDecodeDataInput] extends [never] ? any : TLastDecodeDataInput,
      [TLastEncodeChunkOutput] extends [never] ? any : TLastEncodeChunkOutput,
      [TLastDecodeChunkInput] extends [never] ? any : TLastDecodeChunkInput
    >,
  >(
    storage: TStorage,
  ): IUniKvsBranch<
    TKeyValueMapping,
    [TBranchChunkInput] extends [never]
      ? never
      : [$InferWriteChunkInput<TStorage>] extends [never]
        ? never
        : TBranchChunkInput,
    [TBranchChunkOutput] extends [never]
      ? never
      : [$InferReadChunkOutput<TStorage>] extends [never]
        ? never
        : TBranchChunkOutput,
    $IsUnknown<THeadEncodeDataInput> extends true
      ? $InferWriteDataInput<TStorage>
      : THeadEncodeDataInput,
    $IsUnknown<THeadDecodeDataOutput> extends true
      ? $InferReadDataOutput<TStorage>
      : THeadDecodeDataOutput,
    $IsUnknown<THeadEncodeChunkInput> extends true
      ? $InferWriteChunkInput<TStorage>
      : THeadEncodeChunkInput,
    $IsUnknown<THeadDecodeChunkOutput> extends true
      ? $InferReadChunkOutput<TStorage>
      : THeadDecodeChunkOutput,
    TLastDecodeDataInput,
    TLastEncodeDataOutput,
    TLastDecodeChunkInput,
    TLastEncodeChunkOutput,
    true
  >;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#config-builder)
   */
  fork<
    TSubChunkInput,
    TSubChunkOutput,
    TSubHeadEncodeDataInput,
    TSubHeadDecodeDataOutput,
    TSubHeadEncodeChunkInput,
    TSubHeadDecodeChunkOutput,
    TSubLastDecodeDataInput,
    TSubLastEncodeDataOutput,
    TSubLastDecodeChunkInput,
    TSubLastEncodeChunkOutput,
    TSubHasPersist extends boolean,
  >(
    branch: IUniKvsBranch<
      any,
      TSubChunkInput,
      TSubChunkOutput,
      TSubHeadEncodeDataInput,
      TSubHeadDecodeDataOutput,
      TSubHeadEncodeChunkInput,
      TSubHeadDecodeChunkOutput,
      TSubLastDecodeDataInput,
      TSubLastEncodeDataOutput,
      TSubLastDecodeChunkInput,
      TSubLastEncodeChunkOutput,
      TSubHasPersist
    > &
      (TSubHasPersist extends true
        ? $CheckForkEncodeData<TLastEncodeDataOutput, TSubHeadEncodeDataInput>
        : unknown) &
      (TSubHasPersist extends true
        ? $CheckForkDecodeData<TLastDecodeDataInput, TSubHeadDecodeDataOutput>
        : unknown) &
      (TSubHasPersist extends true
        ? $CheckForkEncodeChunk<TLastEncodeChunkOutput, TSubHeadEncodeChunkInput>
        : unknown) &
      (TSubHasPersist extends true
        ? $CheckForkDecodeChunk<TLastDecodeChunkInput, TSubHeadDecodeChunkOutput>
        : unknown),
  ): IUniKvsBranch<
    TKeyValueMapping,
    TSubHasPersist extends true
      ? [TBranchChunkInput] extends [never]
        ? never
        : [TSubChunkInput] extends [never]
          ? never
          : TBranchChunkInput
      : TBranchChunkInput,
    TSubHasPersist extends true
      ? [TBranchChunkOutput] extends [never]
        ? never
        : [TSubChunkOutput] extends [never]
          ? never
          : TBranchChunkOutput
      : TBranchChunkOutput,
    TSubHasPersist extends true
      ? $IsUnknown<THeadEncodeDataInput> extends true
        ? TSubHeadEncodeDataInput
        : THeadEncodeDataInput
      : THeadEncodeDataInput,
    TSubHasPersist extends true
      ? $IsUnknown<THeadDecodeDataOutput> extends true
        ? TSubHeadDecodeDataOutput
        : THeadDecodeDataOutput
      : THeadDecodeDataOutput,
    TSubHasPersist extends true
      ? $IsUnknown<THeadEncodeChunkInput> extends true
        ? TSubHeadEncodeChunkInput
        : THeadEncodeChunkInput
      : THeadEncodeChunkInput,
    TSubHasPersist extends true
      ? $IsUnknown<THeadDecodeChunkOutput> extends true
        ? TSubHeadDecodeChunkOutput
        : THeadDecodeChunkOutput
      : THeadDecodeChunkOutput,
    TLastDecodeDataInput,
    TLastEncodeDataOutput,
    TLastDecodeChunkInput,
    TLastEncodeChunkOutput,
    TBranchHasPersist extends true ? true : TSubHasPersist
  >;
}

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
  connect<
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

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#config-builder)
   */
  persist<
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
  fork<
    TBranchChunkInput,
    TBranchChunkOutput,
    TBranchHeadEncodeDataInput,
    TBranchHeadDecodeDataOutput,
    TBranchHeadEncodeChunkInput,
    TBranchHeadDecodeChunkOutput,
    TBranchLastDecodeDataInput,
    TBranchLastEncodeDataOutput,
    TBranchLastDecodeChunkInput,
    TBranchLastEncodeChunkOutput,
    TBranchHasPersist extends boolean,
  >(
    branch: IUniKvsBranch<
      any,
      TBranchChunkInput,
      TBranchChunkOutput,
      TBranchHeadEncodeDataInput,
      TBranchHeadDecodeDataOutput,
      TBranchHeadEncodeChunkInput,
      TBranchHeadDecodeChunkOutput,
      TBranchLastDecodeDataInput,
      TBranchLastEncodeDataOutput,
      TBranchLastDecodeChunkInput,
      TBranchLastEncodeChunkOutput,
      TBranchHasPersist
    > &
      (TBranchHasPersist extends true
        ? $CheckForkEncodeData<TLastTransformerEncodeDataOutput, TBranchHeadEncodeDataInput>
        : unknown) &
      (TBranchHasPersist extends true
        ? $CheckForkDecodeData<TLastTransformerDecodeDataInput, TBranchHeadDecodeDataOutput>
        : unknown) &
      (TBranchHasPersist extends true
        ? $CheckForkEncodeChunk<TLastTransformerEncodeChunkOutput, TBranchHeadEncodeChunkInput>
        : unknown) &
      (TBranchHasPersist extends true
        ? $CheckForkDecodeChunk<TLastTransformerDecodeChunkInput, TBranchHeadDecodeChunkOutput>
        : unknown),
  ): IUniKvsConfigBuilder<
    TKeyValueMapping,
    TUniKvsDataInput,
    TUniKvsDataOutput,
    TBranchHasPersist extends true
      ? [TUniKvsChunkInput] extends [never]
        ? never
        : [TBranchChunkInput] extends [never]
          ? never
          : TUniKvsChunkInput
      : TUniKvsChunkInput,
    TBranchHasPersist extends true
      ? [TUniKvsChunkOutput] extends [never]
        ? never
        : [TBranchChunkOutput] extends [never]
          ? never
          : TUniKvsChunkOutput
      : TUniKvsChunkOutput,
    TLastTransformerDecodeDataInput,
    TLastTransformerEncodeDataOutput,
    TLastTransformerDecodeChunkInput,
    TLastTransformerEncodeChunkOutput
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
  connect<
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

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#config-builder)
   */
  persist<
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
  fork<
    TBranchChunkInput,
    TBranchChunkOutput,
    TBranchHeadEncodeDataInput,
    TBranchHeadDecodeDataOutput,
    TBranchHeadEncodeChunkInput,
    TBranchHeadDecodeChunkOutput,
    TBranchLastDecodeDataInput,
    TBranchLastEncodeDataOutput,
    TBranchLastDecodeChunkInput,
    TBranchLastEncodeChunkOutput,
    TBranchHasPersist extends boolean,
  >(
    branch: IUniKvsBranch<
      any,
      TBranchChunkInput,
      TBranchChunkOutput,
      TBranchHeadEncodeDataInput,
      TBranchHeadDecodeDataOutput,
      TBranchHeadEncodeChunkInput,
      TBranchHeadDecodeChunkOutput,
      TBranchLastDecodeDataInput,
      TBranchLastEncodeDataOutput,
      TBranchLastDecodeChunkInput,
      TBranchLastEncodeChunkOutput,
      TBranchHasPersist
    > &
      (TBranchHasPersist extends true
        ? $CheckForkEncodeData<TLastTransformerEncodeDataOutput, TBranchHeadEncodeDataInput>
        : unknown) &
      (TBranchHasPersist extends true
        ? $CheckForkDecodeData<TLastTransformerDecodeDataInput, TBranchHeadDecodeDataOutput>
        : unknown) &
      (TBranchHasPersist extends true
        ? $CheckForkEncodeChunk<TLastTransformerEncodeChunkOutput, TBranchHeadEncodeChunkInput>
        : unknown) &
      (TBranchHasPersist extends true
        ? $CheckForkDecodeChunk<TLastTransformerDecodeChunkInput, TBranchHeadDecodeChunkOutput>
        : unknown),
  ): IUniKvsConfigFinalizer<
    TKeyValueMapping,
    TWriteDataInput,
    TReadDataOutput,
    TBranchHasPersist extends true
      ? [TWriteChunkInput] extends [never]
        ? never
        : [TBranchChunkInput] extends [never]
          ? never
          : TWriteChunkInput
      : TWriteChunkInput,
    TBranchHasPersist extends true
      ? [TReadChunkOutput] extends [never]
        ? never
        : [TBranchChunkOutput] extends [never]
          ? never
          : TReadChunkOutput
      : TReadChunkOutput,
    TLastTransformerDecodeDataInput,
    TLastTransformerEncodeDataOutput,
    TLastTransformerDecodeChunkInput,
    TLastTransformerEncodeChunkOutput
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
export class UniKvsBranch {
  // 自前の相対パイプラインです。
  // 登録順に保持します。
  #transformers: ITransformer[];

  // 自前の分岐先と各登録時点の相対パイプラインのスナップショットです。
  #destinations: { readonly storage: IStorage; readonly transformers: ITransformer[] }[];

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#config-builder)
   */
  public constructor() {
    this.#transformers = [];
    this.#destinations = [];
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#config-builder)
   */
  public connect(transformer: ITransformer): this {
    this.#transformers.push(transformer);

    return this;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#config-builder)
   */
  public persist(storage: IStorage): this {
    // 登録時点のチェーンをスナップショットして保持するため、以降の connect はこの登録に影響しません。
    this.#destinations.push({ storage, transformers: [...this.#transformers] });

    return this;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#config-builder)
   */
  public fork(branch: IUniKvsBranch): this {
    if (!(branch instanceof UniKvsBranch)) {
      throw new TypeError("fork() expects a branch created by UniKvs.branch().");
    }

    const subDestinations = branch._getDestinationsForFork();

    // fork 時点の親チェーンを接頭辞として各分岐先の先頭に付け、末尾の未使用トランスフォーマーは破棄します。
    const prefix = [...this.#transformers];
    for (const dest of subDestinations) {
      this.#destinations.push({
        storage: dest.storage,
        transformers: [...prefix, ...dest.transformers],
      });
    }

    return this;
  }

  /**
   * 分岐先のスナップショットを返します。
   * 親の `fork` で接頭辞付加するために使用します。
   * 外部からは使用しません。
   *
   * @internal
   * @returns 分岐先のコピーを返します。
   */
  private _getDestinationsForFork(): readonly {
    readonly storage: IStorage;
    readonly transformers: readonly ITransformer[];
  }[] {
    // コピーを返します。親の fork で接頭辞を付けても、元の分岐は変更されません。
    return this.#destinations.map((dest) => ({
      storage: dest.storage,
      transformers: [...dest.transformers],
    }));
  }
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#config-builder)
 */
export default class UniKvsConfig implements IUniKvsConfigBuilder, IUniKvsConfigFinalizer {
  /**
   * UniKvs のコンストラクターです。
   */
  readonly #UniKvs: typeof UniKvs;

  /**
   * 登録済みストレージと各登録時点のパイプラインのスナップショットです。
   */
  readonly #destinations: {
    readonly storage: IStorage;
    readonly transformers: ITransformer[];
  }[];

  /**
   * 現在のメインのパイプラインです。
   * 登録順に保持します。
   */
  readonly #transformers: ITransformer[];

  // キーに対応する値のスキーマ情報を解決するリゾルバーです。
  #valueSchemaResolver: IValueSchemaResolver | null;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#config-builder)
   */
  public constructor(UniKvsConstructor: typeof UniKvs, options?: UniKvsConfigOptions) {
    const [{ schema } = {}] = v.parseInput(UniKvsConfigArgsSchema, [options]);

    this.#UniKvs = UniKvsConstructor;
    this.#destinations = [];
    this.#transformers = [];
    this.#valueSchemaResolver = null;
    if (schema) {
      this.#valueSchemaResolver = createValueSchemaResolver(schema);
    }
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#config-builder)
   */
  public create(): UniKvs {
    const wrappers = new Map<ITransformer, UniKvsTransformer>();
    const wrap = (tf: ITransformer): UniKvsTransformer => {
      let w = wrappers.get(tf);
      if (!w) {
        w = new UniKvsTransformer(tf);
        wrappers.set(tf, w);
      }
      return w;
    };

    // ストレージが空の場合は UniKvs として機能できないため、例外を投げます。
    if (this.#destinations.length === 0) {
      throw new MissingStorageError();
    }

    // ビルダーを再利用できるよう、create のたびに trie をコンパイルします。コンパイル後の登録内容は変更しません。
    // 同じトランスフォーマーインスタンスに対するラッパーは共有します。
    const destinations = this.#destinations.map(({ storage, transformers }) => ({
      storage: new UniKvsStorage(storage),
      transformers: transformers.map(wrap),
    }));

    return new this.#UniKvs(
      new Variables(),
      PipelineGraph.compile(destinations),
      this.#valueSchemaResolver,
    );
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#config-builder)
   */
  public connect(transformer: ITransformer): this {
    this.#transformers.push(transformer);

    return this;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#config-builder)
   */
  public persist(storage: IStorage): this {
    this.#destinations.push({
      storage,
      // 登録時点のチェーンをスナップショットして保持するため、以降の connect はこの登録に影響しません。
      transformers: [...this.#transformers],
    });

    return this;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#config-builder)
   */
  public fork(branch: IUniKvsBranch): this {
    if (!(branch instanceof UniKvsBranch)) {
      throw new TypeError("fork() expects a branch created by UniKvs.branch().");
    }

    // private メソッドを構造型経由で呼び出します。型の可視性制限を回避するためです。
    const subDestinations = (
      branch as unknown as {
        _getDestinationsForFork(): readonly {
          readonly storage: IStorage;
          readonly transformers: readonly ITransformer[];
        }[];
      }
    )._getDestinationsForFork();

    // fork 時点の親チェーンを接頭辞として各分岐先の先頭に付け、末尾の未使用トランスフォーマーは破棄します。
    const prefix = [...this.#transformers];
    for (const dest of subDestinations) {
      this.#destinations.push({
        storage: dest.storage,
        transformers: [...prefix, ...dest.transformers],
      });
    }

    return this;
  }
}
