import type {
  Context,
  IReadableStreamStorage,
  IStorage,
  IWritableStreamStorage,
  IDecodableStreamTransformer,
  IEncodableStreamTransformer,
  ITransformer,
} from "@unikvs/core";

import UniKvsStorage from "./_storage.js";
import UniKvsTransformer from "./_transformer.js";
import type { ContextSource } from "./context.types.js";
import { MissingStorageError } from "./errors.js";
import type UniKvs from "./unikvs.js";
import type { ValueOf } from "./utils.types.js";

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
 * プレーンな値を識別するための固有のシンボルです。
 */
declare const PLAIN_VALUE: unique symbol;

/**
 * ストリームではない通常の値を表す型定義です。
 *
 * @template TData 保持するデータの型です。
 */
export type PlainValue<TData = any> = [Type: typeof PLAIN_VALUE, Data: TData];

/**
 * ストリーム形式の値を識別するための固有のシンボルです。
 */
declare const STREAM_VALUE: unique symbol;

/**
 * ストリームとして扱われる値を表す型定義です。
 *
 * @template TChunkData ストリームのチャンクデータの型です。
 */
export type StreamValue<TChunkData = any> = [Type: typeof STREAM_VALUE, ChunkData: TChunkData];

/**
 * UniKvs で扱う値の抽象型です。プレーンな値かストリーム値のいずれかになります。
 *
 * @template TData データまたはチャンクデータの型です。
 */
export type Value<TData = any> = PlainValue<TData> | StreamValue<TData>;

/**
 * キーと値のマッピングを定義するオブジェクトの型です。
 *
 * @template T マッピングされる値の型です。
 */
export type KeyValueMapping<T = any> = { readonly [key: IStorage.Key]: Value<T> };

/**
 * PlainValue 型から内部のデータ型を抽出します。
 *
 * @template TPlainValue 対象となる PlainValue 型です。
 */
export type $InferPlainValueData<TPlainValue> =
  TPlainValue extends PlainValue<infer TData> ? TData : never;

/**
 * StreamValue 型から内部のチャンクデータ型を抽出します。
 *
 * @template TStremValue 対象となる StreamValue 型です。
 */
export type $InferStreamValueChunkData<TStremValue> =
  TStremValue extends StreamValue<infer TChunkData> ? TChunkData : never;

/**
 * KeyValueMapping から有効なキーの型を抽出します。
 *
 * @template TKeyValueMapping 対象となるマッピング型です。
 */
export type KeyofKeyValueMapping<TKeyValueMapping extends KeyValueMapping = KeyValueMapping> =
  Extract<keyof TKeyValueMapping, IStorage.Key>;

/**
 * UniKvs の設定を構築するためのビルダーインターフェースです。
 *
 * トランスフォーマーの追加やストレージの登録を型安全に行うための流れるようなインターフェースを提供します。
 *
 * @template TKeyValueMapping キーと値のマッピング型です。
 * @template TUniKvsDataInput UniKvs への入力データの型です。
 * @template TUniKvsDataOutput UniKvs からの出力データの型です。
 * @template TUniKvsChunkInput UniKvs への入力チャンクデータの型です。
 * @template TUniKvsChunkOutput UniKvs からのストリーム出力チャンクデータの型です。
 * @template TLastTransformerDecodeDataInput 最後に適用されたトランスフォーマーのデコード入力データの型です。
 * @template TLastTransformerEncodeDataOutput 最後に適用されたトランスフォーマーのエンコード出力データの型です。
 * @template TLastTransformerDecodeChunkInput 最後に適用されたトランスフォーマーのデコード入力チャンクデータの型です。
 * @template TLastTransformerEncodeChunkOutput 最後に適用されたトランスフォーマーのエンコード出力チャンクデータの型です。
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
   * コンテキスト情報を設定します。
   *
   * @param context 設定するコンテキストのソースです。
   * @returns インスタンス自身を返します。
   */
  setContext(context: ContextSource): this;

  /**
   * ストレージをパイプラインの終端に追加します。
   *
   * ストレージが追加されると、設定はファイナライズ段階に移行します。
   *
   * @template TStorage 追加するストレージの型です。
   * @param storage ストレージのインスタンスです。
   * @returns ファイナライザーインターフェースを返します。
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
        : TLastTransformerDecodeChunkInput
  >;

  /**
   * トランスフォーマーをパイプラインに追加します。
   *
   * データ変換の層を積み重ねることで、シリアライズなどの処理を定義できます。
   *
   * @template TTransformer 追加するトランスフォーマーの型です。
   * @param transformer トランスフォーマーのインスタンスです。
   * @returns 新しい型情報を持つビルダーを返します。
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
 * UniKvs の設定を完了させるためのファイナライザーインターフェースです。
 *
 * @template TKeyValueMapping キーと値のマッピング型です。
 * @template TWriteDataInput ストレージへの書き込み入力データの型です。
 * @template TReadDataOutput ストレージからの読み込み出力データの型です。
 * @template TWriteChunkInput ストレージへの書き込みチャンクデータの型です。
 * @template TReadChunkOutput ストレージからの読み込みチャンクデータの型です。
 */
export interface IUniKvsConfigFinalizer<
  TKeyValueMapping extends KeyValueMapping = KeyValueMapping,
  TWriteDataInput = any,
  TReadDataOutput = any,
  TWriteChunkInput = any,
  TReadChunkOutput = any,
> {
  /**
   * 設定に基づいて UniKvs インスタンスを作成します。
   *
   * @returns 作成された UniKvs のインスタンスです。
   */
  create(): UniKvs<TKeyValueMapping>;

  /**
   * コンテキスト情報を設定します。
   *
   * @param context 設定するコンテキストのソースです。
   * @returns インスタンス自身を返します。
   */
  setContext(context: ContextSource): this;

  /**
   * 追加のストレージを登録します。UniKvs は複数のストレージへのマルチキャスト書き込みをサポートします。
   *
   * @template TStorage 追加するストレージの型です。
   * @param storage ストレージのインスタンスです。
   * @returns ファイナライザーインターフェースを返します。
   */
  appendStorage<
    TStorage extends IStorage<
      [TWriteDataInput] extends [never] ? any : TWriteDataInput,
      [TReadDataOutput] extends [never] ? any : TReadDataOutput,
      [TWriteChunkInput] extends [never] ? any : TWriteChunkInput,
      [TReadChunkOutput] extends [never] ? any : TReadChunkOutput
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
        : TReadChunkOutput
  >;
}

/**
 * UniKvs の構成を管理する設定クラスです。
 *
 * ビルダーパターンを用いて、コンテキスト、トランスフォーマー、ストレージの順で設定を積み上げます。
 */
export default class UniKvsConfig implements IUniKvsConfigBuilder, IUniKvsConfigFinalizer {
  /**
   * UniKvs のコンストラクターです。
   */
  readonly #UniKvs: typeof UniKvs;

  /**
   * アプリケーションの実行時情報を保持するコンテキストオブジェクトです。
   */
  #context: Context;

  /**
   * データの永続化先となるストレージのリストです。
   */
  readonly #destinations: IStorage[];

  /**
   * データを変換するためのトランスフォーマーのリストです。
   */
  readonly #transformers: ITransformer[];

  /**
   * UniKvsConfig インスタンスを初期化します。
   *
   * @param UniKvsConstructor UniKvs のクラスコンストラクターです。
   */
  public constructor(UniKvsConstructor: typeof UniKvs) {
    this.#UniKvs = UniKvsConstructor;
    this.#context = {};
    this.#destinations = [];
    this.#transformers = [];
  }

  /**
   * 現在の設定を使用して UniKvs インスタンスを作成します。
   *
   * @returns 作成された UniKvs インスタンスです。
   * @throws ストレージが一つも登録されていない場合にエラーを投げます。
   */
  public create(): UniKvs {
    // 登録されたストレージから先頭の要素を取得します。
    const [dest, ...destinations] = this.#destinations.map((io) => new UniKvsStorage(io));

    // ストレージが空の場合は UniKvs として機能できないため、例外を投げます。
    if (!dest) {
      throw new MissingStorageError();
    }

    // コンテキストの参照を切り離すために浅いコピーを作成して UniKvs を初期化します。
    // トランスフォーマーの配列もスライスしてコピーを渡し、内部状態の安全性を確保します。
    return new this.#UniKvs(
      this.#context,
      [dest, ...destinations],
      this.#transformers.map((tf) => new UniKvsTransformer(tf)),
    );
  }

  /**
   * コンテキスト情報を設定します。既存のコンテキストは上書きされます。
   *
   * @param context 設定するコンテキストのソースデータです。
   * @returns インスタンス自身を返します。
   */
  public setContext(context: ContextSource): this {
    this.#context = Array.isArray(context) ? Object.fromEntries(context) : { ...context };

    return this;
  }

  /**
   * ストレージを登録リストに追加します。
   *
   * @param storage 追加するストレージインスタンスです。
   * @returns ファイナライザーとして自身を返します。
   */
  public appendStorage(storage: IStorage): IUniKvsConfigFinalizer {
    this.#destinations.push(storage);

    return this;
  }

  /**
   * トランスフォーマーを変換パイプラインに追加します。
   *
   * ストレージが登録された後には追加できない制約があります。
   *
   * @param transformer 追加するトランスフォーマーインスタンスです。
   * @returns ビルダーとして自身を返します。
   * @throws すでにストレージが登録されている状態で呼び出された場合にエラーを投げます。
   */
  public appendTransformer(transformer: ITransformer): IUniKvsConfigBuilder {
    // パイプラインの順序を守るため、終端であるストレージが登録済みでないか確認します。
    if (this.#destinations.length > 0) {
      throw new TransformStreamDefaultController();
    }

    this.#transformers.push(transformer);

    return this;
  }
}
