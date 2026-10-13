import type {
  IStorage,
  ITransformer,
  IReadableStreamStorage,
  IWritableStreamStorage,
  IDecodableStreamTransformer,
  IEncodableStreamTransformer,
} from "@unikvs/core";

import type { Value } from "./_value-schemas.js";

/**
 * トランスフォーマーから、デコード時の入力データの型を推論するユーティリティー型です。
 *
 * @template TTransformer 対象となるトランスフォーマーの型です。
 */
export type $InferDecodeDataInput<TTransformer extends ITransformer> =
  TTransformer extends ITransformer<any, infer TDecodeDataInput, any, any, any, any, any, any>
    ? TDecodeDataInput
    : never;

/**
 * トランスフォーマーから、エンコード時の出力データの型を推論するユーティリティー型です。
 *
 * @template TTransformer 対象となるトランスフォーマーの型です。
 */
export type $InferEncodeDataOutput<TTransformer extends ITransformer> =
  TTransformer extends ITransformer<any, any, infer TEncodeDataOutput, any, any, any, any, any>
    ? TEncodeDataOutput
    : never;

/**
 * トランスフォーマーから、エンコード時の入力データの型を推論するユーティリティー型です。
 * 分岐先頭の親出力受容検査に使用します。
 *
 * @template TTransformer 対象となるトランスフォーマーの型です。
 */
export type $InferEncodeDataInput<TTransformer extends ITransformer> =
  TTransformer extends ITransformer<infer TEncodeDataInput, any, any, any, any, any, any, any>
    ? TEncodeDataInput
    : never;

/**
 * トランスフォーマーから、デコード時の出力データの型を推論するユーティリティー型です。
 * 分岐先頭の親入力受容検査に使用します。
 *
 * @template TTransformer 対象となるトランスフォーマーの型です。
 */
export type $InferDecodeDataOutput<TTransformer extends ITransformer> =
  TTransformer extends ITransformer<any, any, any, infer TDecodeDataOutput, any, any, any, any>
    ? TDecodeDataOutput
    : never;

/**
 * トランスフォーマーから、デコードストリームの入力チャンクデータの型を推論するユーティリティー型です。
 *
 * @template TTransformer 対象となるトランスフォーマーの型です。
 */
export type $InferDecodeChunkInput<TTransformer extends ITransformer> =
  TTransformer extends IDecodableStreamTransformer<infer TDecodeChunkInput>
    ? TDecodeChunkInput
    : never;

/**
 * トランスフォーマーから、エンコードストリームの出力チャンクデータの型を推論するユーティリティー型です。
 *
 * @template TTransformer 対象となるトランスフォーマーの型です。
 */
export type $InferEncodeChunkOutput<TTransformer extends ITransformer> =
  TTransformer extends IEncodableStreamTransformer<any, infer TEncodeChunkOutput>
    ? TEncodeChunkOutput
    : never;

/**
 * トランスフォーマーから、エンコードストリームの入力チャンクデータの型を推論するユーティリティー型です。
 * 分岐先頭のチャンク検査に使用します。
 *
 * @template TTransformer 対象となるトランスフォーマーの型です。
 */
export type $InferEncodeChunkInput<TTransformer extends ITransformer> =
  TTransformer extends IEncodableStreamTransformer<infer TEncodeChunkInput, any>
    ? TEncodeChunkInput
    : never;

/**
 * トランスフォーマーから、デコードストリームの出力チャンクデータの型を推論するユーティリティー型です。
 * 分岐先頭のチャンク検査に使用します。
 *
 * @template TTransformer 対象となるトランスフォーマーの型です。
 */
export type $InferDecodeChunkOutput<TTransformer extends ITransformer> =
  TTransformer extends IDecodableStreamTransformer<any, infer TDecodeChunkOutput>
    ? TDecodeChunkOutput
    : never;

/**
 * ストレージから、書き込みデータの入力型を推論するユーティリティー型です。
 * 分岐先頭の親出力受容検査に使用します。
 *
 * @template TStorage 対象となるストレージの型です。
 */
export type $InferWriteDataInput<TStorage extends IStorage> =
  TStorage extends IStorage<infer TWriteDataInput, any, any, any> ? TWriteDataInput : never;

/**
 * ストレージから、読み込みデータの出力型を推論するユーティリティー型です。
 * 分岐先頭の親入力受容検査に使用します。
 *
 * @template TStorage 対象となるストレージの型です。
 */
export type $InferReadDataOutput<TStorage extends IStorage> =
  TStorage extends IStorage<any, infer TReadDataOutput, any, any> ? TReadDataOutput : never;

/**
 * ストレージから、書き込みストリームの入力チャンクデータの型を推論するユーティリティー型です。
 *
 * @template TStorage 対象となるストレージの型です。
 */
export type $InferWriteChunkInput<TStorage extends IStorage> =
  TStorage extends IWritableStreamStorage<infer TWriteChunkInput> ? TWriteChunkInput : never;

/**
 * ストレージから、読み込みストリームの出力チャンクデータの型を推論するユーティリティー型です。
 *
 * @template TStorage 対象となるストレージの型です。
 */
export type $InferReadChunkOutput<TStorage extends IStorage> =
  TStorage extends IReadableStreamStorage<infer TReadChunkOutput> ? TReadChunkOutput : never;

/**
 * `any` かどうかを判定するユーティリティー型です。
 * 分岐先頭の空判定で `any` を `unknown` と区別するために使用します。
 *
 * @template T 判定する型です。
 */
export type $IsAny<T> = 0 extends 1 & T ? true : false;

/**
 * `unknown` かどうかを判定するユーティリティー型です。
 * 空ブランチの先頭マーカー検出に使用します。
 *
 * @template T 判定する型です。
 */
export type $IsUnknown<T> =
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
export type $IsNever<T> = [T] extends [never] ? true : false;

/**
 * 親出力が分岐先頭のエンコード入力を受容できるかを検査するユーティリティー型です。
 * 不適合時は `never` を返し、`fork` 引数を `never` 化して型エラーを発生させます。
 * 先頭のみを検査します。
 * 中間以降は検査しません。
 *
 * @template TParentOutput 親の現出力型です。
 * @template TBranchHeadInput 分岐先頭の入力型です。
 */
export type $CheckForkEncodeData<TParentOutput, TBranchHeadInput> =
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
export type $CheckForkDecodeData<TParentInput, TBranchHeadOutput> =
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
export type $CheckForkEncodeChunk<TParentOutput, TBranchHeadInput> =
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
export type $CheckForkDecodeChunk<TParentInput, TBranchHeadOutput> =
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
