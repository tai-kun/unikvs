import type { IMiddleware, IStorage } from "@unikvs/core";

import UniKvsMiddleware from "./_middleware.js";
import { PipelineGraph } from "./_pipeline-graph.js";
import UniKvsStorage from "./_storage.js";
import type {
  ValueOf,
  $CheckForkDecodeData,
  $CheckForkEncodeData,
  $CheckForkDecodeChunk,
  $CheckForkEncodeChunk,
  $InferDecodeDataInput,
  $InferReadChunkOutput,
  $InferWriteChunkInput,
  $InferDecodeChunkInput,
  $InferEncodeDataOutput,
  $InferEncodeChunkOutput,
} from "./_types.js";
import { getBranchDestinationsForFork } from "./_unikvs-branch.js";
import * as v from "./_valibot.js";
import {
  type $InferPlainValueData,
  type IValueSchemaResolver,
  type $InferStreamValueChunkData,
  ValueSchemaInfo,
  VALUE_SCHEMA_BRAND,
  createValueSchemaResolver,
} from "./_value-schemas.js";
import { MissingStorageError } from "./errors.js";
import type { IUniKvsBranch, KeyValueMapping } from "./unikvs-branch.js";
import type UniKvs from "./unikvs.js";
import type { Value } from "./value-schemas.js";

type KeyofKVMap<TKeyValueMapping extends KeyValueMapping = KeyValueMapping> = Extract<
  keyof TKeyValueMapping,
  string
>;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#config-builder)
 */
export interface IUniKvsConfigBuilder<
  TKeyValueMapping extends KeyValueMapping = KeyValueMapping,
  TUniKvsDataInput = ValueOf<{
    [TKey in KeyofKVMap<TKeyValueMapping>]: $InferPlainValueData<TKeyValueMapping[TKey]>;
  }>,
  TUniKvsDataOutput = TUniKvsDataInput,
  TUniKvsChunkInput = ValueOf<{
    [TKey in KeyofKVMap<TKeyValueMapping>]: $InferStreamValueChunkData<TKeyValueMapping[TKey]>;
  }>,
  TUniKvsChunkOutput = TUniKvsChunkInput,
  TLastMiddlewareDecodeDataInput = TUniKvsDataOutput,
  TLastMiddlewareEncodeDataOutput = TUniKvsDataInput,
  TLastMiddlewareDecodeChunkInput = TUniKvsChunkOutput,
  TLastMiddlewareEncodeChunkOutput = TUniKvsChunkInput,
> {
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
        ? $CheckForkEncodeData<TLastMiddlewareEncodeDataOutput, TBranchHeadEncodeDataInput>
        : unknown) &
      (TBranchHasPersist extends true
        ? $CheckForkDecodeData<TLastMiddlewareDecodeDataInput, TBranchHeadDecodeDataOutput>
        : unknown) &
      (TBranchHasPersist extends true
        ? $CheckForkEncodeChunk<TLastMiddlewareEncodeChunkOutput, TBranchHeadEncodeChunkInput>
        : unknown) &
      (TBranchHasPersist extends true
        ? $CheckForkDecodeChunk<TLastMiddlewareDecodeChunkInput, TBranchHeadDecodeChunkOutput>
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
    TLastMiddlewareDecodeDataInput,
    TLastMiddlewareEncodeDataOutput,
    TLastMiddlewareDecodeChunkInput,
    TLastMiddlewareEncodeChunkOutput
  >;

  use<
    TMiddleware extends IMiddleware<
      [TLastMiddlewareEncodeDataOutput] extends [never] ? any : TLastMiddlewareEncodeDataOutput,
      any,
      [TLastMiddlewareEncodeChunkOutput] extends [never] ? any : TLastMiddlewareEncodeChunkOutput,
      any
    >,
  >(
    middleware: TMiddleware,
  ): IUniKvsConfigBuilder<
    TKeyValueMapping,
    TUniKvsDataInput,
    TUniKvsDataOutput,
    [TUniKvsChunkInput] extends [never]
      ? never
      : [$InferDecodeChunkInput<TMiddleware>] extends [never]
        ? never
        : TUniKvsChunkInput,
    [TUniKvsChunkOutput] extends [never]
      ? never
      : [$InferEncodeChunkOutput<TMiddleware>] extends [never]
        ? never
        : TUniKvsChunkOutput,
    $InferDecodeDataInput<TMiddleware>,
    $InferEncodeDataOutput<TMiddleware>,
    $InferDecodeChunkInput<TMiddleware>,
    $InferEncodeChunkOutput<TMiddleware>
  >;

  persist<
    TStorage extends IStorage<
      [TLastMiddlewareEncodeDataOutput] extends [never] ? any : TLastMiddlewareEncodeDataOutput,
      [TLastMiddlewareDecodeDataInput] extends [never] ? any : TLastMiddlewareDecodeDataInput,
      [TLastMiddlewareEncodeChunkOutput] extends [never] ? any : TLastMiddlewareEncodeChunkOutput,
      [TLastMiddlewareDecodeChunkInput] extends [never] ? any : TLastMiddlewareDecodeChunkInput
    >,
  >(
    storage: TStorage,
  ): IUniKvsConfigFinalizer<
    TKeyValueMapping,
    TLastMiddlewareEncodeDataOutput,
    TLastMiddlewareDecodeDataInput,
    [TLastMiddlewareEncodeChunkOutput] extends [never]
      ? never
      : [$InferWriteChunkInput<TStorage>] extends [never]
        ? never
        : TLastMiddlewareEncodeChunkOutput,
    [TLastMiddlewareDecodeChunkInput] extends [never]
      ? never
      : [$InferReadChunkOutput<TStorage>] extends [never]
        ? never
        : TLastMiddlewareDecodeChunkInput,
    TLastMiddlewareDecodeDataInput,
    TLastMiddlewareEncodeDataOutput,
    TLastMiddlewareDecodeChunkInput,
    TLastMiddlewareEncodeChunkOutput
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
  TLastMiddlewareDecodeDataInput = TReadDataOutput,
  TLastMiddlewareEncodeDataOutput = TWriteDataInput,
  TLastMiddlewareDecodeChunkInput = TReadChunkOutput,
  TLastMiddlewareEncodeChunkOutput = TWriteChunkInput,
> {
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
        ? $CheckForkEncodeData<TLastMiddlewareEncodeDataOutput, TBranchHeadEncodeDataInput>
        : unknown) &
      (TBranchHasPersist extends true
        ? $CheckForkDecodeData<TLastMiddlewareDecodeDataInput, TBranchHeadDecodeDataOutput>
        : unknown) &
      (TBranchHasPersist extends true
        ? $CheckForkEncodeChunk<TLastMiddlewareEncodeChunkOutput, TBranchHeadEncodeChunkInput>
        : unknown) &
      (TBranchHasPersist extends true
        ? $CheckForkDecodeChunk<TLastMiddlewareDecodeChunkInput, TBranchHeadDecodeChunkOutput>
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
    TLastMiddlewareDecodeDataInput,
    TLastMiddlewareEncodeDataOutput,
    TLastMiddlewareDecodeChunkInput,
    TLastMiddlewareEncodeChunkOutput
  >;

  use<
    TMiddleware extends IMiddleware<
      [TLastMiddlewareEncodeDataOutput] extends [never] ? any : TLastMiddlewareEncodeDataOutput,
      any,
      [TLastMiddlewareEncodeChunkOutput] extends [never] ? any : TLastMiddlewareEncodeChunkOutput,
      any
    >,
  >(
    middleware: TMiddleware,
  ): IUniKvsConfigFinalizer<
    TKeyValueMapping,
    TWriteDataInput,
    TReadDataOutput,
    TWriteChunkInput,
    TReadChunkOutput,
    $InferDecodeDataInput<TMiddleware>,
    $InferEncodeDataOutput<TMiddleware>,
    $InferDecodeChunkInput<TMiddleware>,
    $InferEncodeChunkOutput<TMiddleware>
  >;

  persist<
    TStorage extends IStorage<
      [TLastMiddlewareEncodeDataOutput] extends [never] ? any : TLastMiddlewareEncodeDataOutput,
      [TLastMiddlewareDecodeDataInput] extends [never] ? any : TLastMiddlewareDecodeDataInput,
      [TLastMiddlewareEncodeChunkOutput] extends [never] ? any : TLastMiddlewareEncodeChunkOutput,
      [TLastMiddlewareDecodeChunkInput] extends [never] ? any : TLastMiddlewareDecodeChunkInput
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
    TLastMiddlewareDecodeDataInput,
    TLastMiddlewareEncodeDataOutput,
    TLastMiddlewareDecodeChunkInput,
    TLastMiddlewareEncodeChunkOutput
  >;

  create(): UniKvs<TKeyValueMapping>;
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

/**
 * オブジェクト形式のスキーマ定義です。キーをそのままキーとして扱います。
 */
export type UniKvsSchemaRecord = {
  readonly [key: string]: Value;
};

/**
 * 配列形式のスキーマ定義です。キーのスキーマと値のスキーマの組を並べます。
 */
export type UniKvsSchemaEntries = readonly (readonly [v.GenericSchema, Value])[];

/**
 * `UniKvs.config()` の `schema` オプションに指定できるスキーマ定義です。
 */
export type UniKvsSchema = UniKvsSchemaRecord | UniKvsSchemaEntries;

/**
 * 値が Valibot のスキーマであるかどうかを判定します。
 */
function isGenericSchema(input: unknown): input is v.GenericSchema {
  return (
    typeof input === "object" &&
    input !== null &&
    // v.GenericSchema は関数 "~run" を持ちます。
    "~run" in input &&
    typeof input["~run"] === "function"
  );
}

/**
 * 値がスキーマ情報であるかどうかを判定します。
 */
function isValueSchemaInfo(input: unknown): input is ValueSchemaInfo {
  return (
    typeof input === "object" &&
    input !== null &&
    VALUE_SCHEMA_BRAND in input &&
    input[VALUE_SCHEMA_BRAND] === true
  );
}

const UniKvsConfigOptionsSchema = v.object({
  /**
   * キーと値のスキーマ定義です。
   */
  schema: v.optional(
    v.union([
      v.array(
        v.tuple([
          v.custom<v.GenericSchema>(isGenericSchema),
          v.custom<ValueSchemaInfo>(isValueSchemaInfo),
        ]),
      ),
      v.record(v.string(), v.custom<ValueSchemaInfo>(isValueSchemaInfo)),
    ]),
  ),
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
   * 登録済みストレージと各登録時点のパイプラインのスナップショットです。
   */
  readonly #destinations: {
    /**
     * データの永続化先です。
     */
    readonly storage: UniKvsStorage;

    /**
     * ストレージに対するパイプラインです。
     * 登録順に保持します。
     */
    readonly middlewares: readonly UniKvsMiddleware[];
  }[];

  /**
   * 現在のメインのパイプラインです。
   * 登録順に保持します。
   */
  readonly #middlewares: UniKvsMiddleware[];

  /**
   * キーに対応する値のスキーマ情報を解決するリゾルバーです。
   */
  readonly #valueSchemaResolver: IValueSchemaResolver | null;

  public constructor(UniKvsConstructor: typeof UniKvs, options?: UniKvsConfigOptions) {
    const [{ schema } = {}] = v.parseInput(UniKvsConfigArgsSchema, [options]);

    this.#UniKvs = UniKvsConstructor;
    this.#destinations = [];
    this.#middlewares = [];
    this.#valueSchemaResolver = null;
    if (schema) {
      this.#valueSchemaResolver = createValueSchemaResolver(schema);
    }
  }

  public fork(branch: IUniKvsBranch): this {
    const prefix = [...this.#middlewares];
    const destinations = getBranchDestinationsForFork(branch);
    for (const dest of destinations) {
      this.#destinations.push({
        storage: dest.storage,
        // fork 時点の親チェーンを接頭辞として各分岐先の先頭に付け、ブランチのミドルウェアを結合します。
        middlewares: [...prefix, ...dest.middlewares],
      });
    }

    return this;
  }

  public use(middleware: IMiddleware): this {
    this.#middlewares.push(UniKvsMiddleware.from(middleware));

    return this;
  }

  public persist(storage: IStorage): this {
    this.#destinations.push({
      storage: UniKvsStorage.from(storage),
      // 登録時点のチェーンをスナップショットして保持するため、以降の use はこの登録に影響しません。
      middlewares: [...this.#middlewares],
    });

    return this;
  }

  public create(): UniKvs {
    // ストレージが空の場合は UniKvs として機能できないため、例外を投げます。
    if (this.#destinations.length === 0) {
      throw new MissingStorageError();
    }

    return new this.#UniKvs(
      {},
      // ビルダーを再利用できるよう、create のたびに trie をコンパイルします。コンパイル後の登録内容は変更しません。
      // 同じミドルウェアインスタンスに対するラッパーは共有します。
      PipelineGraph.compile([...this.#destinations]),
      this.#valueSchemaResolver,
    );
  }
}
