import type {
  IStorage,
  ITransformer,
  IReadableStreamStorage,
  IWritableStreamStorage,
  IDecodableStreamTransformer,
  IEncodableStreamTransformer,
} from "@unikvs/core";

export type ValueOf<T> = T[keyof T];

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
