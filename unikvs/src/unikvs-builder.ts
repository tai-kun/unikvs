import type { IStorage, IMiddleware } from "@unikvs/core";

import type { VariablesInit } from "./_contexts.js";
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
import { appendForkDestinations } from "./_unikvs-branch.js";
import { VariablesArgsSchema, VariablesInitSchema } from "./_unikvs.schemas.js";
import * as v from "./_valibot.js";
import {
  type ValueSchemaInfo,
  type $InferPlainValueData,
  type IValueSchemaResolver,
  type $InferStreamValueChunkData,
  VALUE_SCHEMA_BRAND,
  createValueSchemaResolver,
} from "./_value-schemas.js";
import { MissingStorageError } from "./errors.js";
import type { IUniKvsBranch, KeyValueMapping } from "./unikvs-branch.js";
import UniKvs from "./unikvs.js";
import type { Value } from "./value-schemas.js";

type KeyofKVMap<TKeyValueMapping extends KeyValueMapping = KeyValueMapping> = Extract<
  keyof TKeyValueMapping,
  string
>;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#builder)
 */
export interface IUniKvsBuilder<
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
  /**
   * 分岐したパイプラインを追加します。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#builder-fork)
   *
   * @throws 分岐がストレージに到達しない場合に `InvalidForkError` を投げます。
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
  ): IUniKvsBuilder<
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
      [TLastMiddlewareEncodeChunkOutput] extends [never] ? any : TLastMiddlewareEncodeChunkOutput
    >,
  >(
    middleware: TMiddleware,
  ): IUniKvsBuilder<
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
  ): IUniKvsBuilderFinalizer<
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

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#base-vars-set-vars)
   */
  setVars(vars: VariablesInit): this;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#base-vars-assign-vars)
   */
  assignVars(vars: VariablesInit): this;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#base-vars-defaults-vars)
   */
  defaultsVars(vars: VariablesInit): this;

  /**
   * 現在の構成が有効かどうかを判定します。
   *
   * 有効とは、1 件以上のストレージが登録されている状態です。
   * ストレージに到達しない分岐は `fork()` の時点で `InvalidForkError` になるため、分岐の有効性は fork 時に保証されます。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#builder-is-valid)
   */
  isValid(): boolean;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#builder)
 */
export interface IUniKvsBuilderFinalizer<
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
  /**
   * 分岐したパイプラインを追加します。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#builder-fork)
   *
   * @throws 分岐がストレージに到達しない場合に `InvalidForkError` を投げます。
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
  ): IUniKvsBuilderFinalizer<
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
      [TLastMiddlewareEncodeChunkOutput] extends [never] ? any : TLastMiddlewareEncodeChunkOutput
    >,
  >(
    middleware: TMiddleware,
  ): IUniKvsBuilderFinalizer<
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
  ): IUniKvsBuilderFinalizer<
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

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#base-vars-set-vars)
   */
  setVars(vars: VariablesInit): this;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#base-vars-assign-vars)
   */
  assignVars(vars: VariablesInit): this;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#base-vars-defaults-vars)
   */
  defaultsVars(vars: VariablesInit): this;

  /**
   * 現在の構成が有効かどうかを判定します。
   *
   * 有効とは、1 件以上のストレージが登録されている状態です。
   * ストレージに到達しない分岐は `fork()` の時点で `InvalidForkError` になるため、分岐の有効性は fork 時に保証されます。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#builder-is-valid)
   */
  isValid(): boolean;

  /**
   * `UniKvs` クライアントを作成します。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#builder)
   *
   * @param options ビルドオプションです。
   *
   * @returns 作成したクライアントを返します。
   */
  build(options?: UniKvsBuildOptions): UniKvs<TKeyValueMapping>;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#builder)
 */
export type UniKvsBuilderOptions = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#base-vars)
   */
  readonly vars?: VariablesInit | undefined;
  readonly schema?: UniKvsSchema | undefined;
};

/**
 * `build()` のオプションです。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#builder)
 */
export type UniKvsBuildOptions = {
  /**
   * 既存のすべてのミドルウェアより前に挿入するミドルウェアの配列です。
   * 先頭ほど手前、末尾ほど後続のミドルウェアに近づくように挿入されます。
   */
  readonly beforeAll?: readonly IMiddleware[] | undefined;

  /**
   * すべてのストレージの直前に挿入するミドルウェアの配列です。
   * 先頭ほど既存のパイプライン側、末尾ほどストレージ側に近づくように挿入されます。
   */
  readonly beforeStorage?: readonly IMiddleware[] | undefined;
};

/**
 * オブジェクト形式のスキーマ定義です。キーをそのままキーとして扱います。
 */
export type UniKvsSchemaRecord = Readonly<Record<string, Value>>;

/**
 * 配列形式のスキーマ定義です。キーのスキーマと値のスキーマの組を並べます。
 */
export type UniKvsSchemaEntries = readonly (readonly [v.GenericSchema, Value])[];

/**
 * `new Builder()` の `schema` オプションに指定できるスキーマ定義です。
 */
export type UniKvsSchema = UniKvsSchemaRecord | UniKvsSchemaEntries;

/**
 * スキーマ定義からキーと値のマッピング型を推論します。
 *
 * @template TSchema 対象となるスキーマ定義の型です。
 */
export type $InferKeyValueMapping<TSchema extends UniKvsSchema> =
  TSchema extends readonly (readonly [v.GenericSchema, infer TValue extends Value])[]
    ? Readonly<Record<string, TValue>>
    : TSchema extends Readonly<Record<string, Value>>
      ? { readonly [TKey in keyof TSchema]: TSchema[TKey] }
      : never;

/**
 * 値が Valibot のスキーマであるかどうかを判定します。
 */
function isGenericSchema(input: unknown): input is v.GenericSchema {
  return (
    typeof input === "object" &&
    input !== null &&
    // GenericSchema は関数 "~run" を持ちます。
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

const UniKvsBuilderOptionsSchema = v.object({
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

  /**
   * 基本となる実行時変数です。
   */
  vars: v.optional(VariablesInitSchema),
});

const UniKvsBuilderArgsSchema = v.tuple([v.optional(UniKvsBuilderOptionsSchema)]);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#builder)
 */
export default class UniKvsBuilder<
  const TInit extends KeyValueMapping | UniKvsSchema = KeyValueMapping,
  TKeyValueMapping extends KeyValueMapping = $InferKeyValueMapping<TInit>,
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
> implements IUniKvsBuilder<
  TKeyValueMapping,
  TUniKvsDataInput,
  TUniKvsDataOutput,
  TUniKvsChunkInput,
  TUniKvsChunkOutput,
  TLastMiddlewareDecodeDataInput,
  TLastMiddlewareEncodeDataOutput,
  TLastMiddlewareDecodeChunkInput,
  TLastMiddlewareEncodeChunkOutput
> {
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

  /**
   * 基本となる実行時変数です。
   *
   * 各操作の `vars` と結合して使用されます。
   */
  readonly #vars: Map<string, unknown>;

  public constructor(options?: Omit<UniKvsBuilderOptions, "schema"> & { readonly schema?: TInit });
  public constructor(...args: unknown[]) {
    const [options = {}] = v.parseInput(UniKvsBuilderArgsSchema, args);
    const { vars, schema } = options;

    this.#destinations = [];
    this.#middlewares = [];
    this.#valueSchemaResolver = null;
    this.#vars = new Map(vars);
    if (schema) {
      this.#valueSchemaResolver = createValueSchemaResolver(schema);
    }
  }

  public fork<
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
  ): IUniKvsBuilder<
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
  public fork(branch: IUniKvsBranch): IUniKvsBuilder {
    appendForkDestinations(this.#destinations, this.#middlewares, branch);

    return this;
  }

  public use<
    TMiddleware extends IMiddleware<
      [TLastMiddlewareEncodeDataOutput] extends [never] ? any : TLastMiddlewareEncodeDataOutput,
      any,
      [TLastMiddlewareEncodeChunkOutput] extends [never] ? any : TLastMiddlewareEncodeChunkOutput
    >,
  >(
    middleware: TMiddleware,
  ): IUniKvsBuilder<
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
  public use(middleware: IMiddleware): IUniKvsBuilder {
    this.#middlewares.push(UniKvsMiddleware.from(middleware));

    return this;
  }

  public persist<
    TStorage extends IStorage<
      [TLastMiddlewareEncodeDataOutput] extends [never] ? any : TLastMiddlewareEncodeDataOutput,
      [TLastMiddlewareDecodeDataInput] extends [never] ? any : TLastMiddlewareDecodeDataInput,
      [TLastMiddlewareEncodeChunkOutput] extends [never] ? any : TLastMiddlewareEncodeChunkOutput,
      [TLastMiddlewareDecodeChunkInput] extends [never] ? any : TLastMiddlewareDecodeChunkInput
    >,
  >(
    storage: TStorage,
  ): IUniKvsBuilderFinalizer<
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
  public persist(storage: IStorage): IUniKvsBuilder {
    this.#destinations.push({
      storage: UniKvsStorage.from(storage),
      // 登録時点のチェーンをスナップショットして保持するため、以降の use はこの登録に影響しません。
      middlewares: [...this.#middlewares],
    });

    return this;
  }

  public setVars(vars: VariablesInit): this;
  public setVars(...args: unknown[]): this {
    const [vars] = v.parseInput(VariablesArgsSchema, args);

    this.#vars.clear();
    for (const [name, value] of vars) {
      this.#vars.set(name, value);
    }

    return this;
  }

  public assignVars(vars: VariablesInit): this;
  public assignVars(...args: unknown[]): this {
    const [vars] = v.parseInput(VariablesArgsSchema, args);

    const target = this.#vars;
    const source = vars;

    for (const [name, value] of source) {
      target.set(name, value);
    }

    return this;
  }

  public defaultsVars(vars: VariablesInit): this;
  public defaultsVars(...args: unknown[]): this {
    const [vars] = v.parseInput(VariablesArgsSchema, args);

    const target = new Map(vars);
    const source = this.#vars;

    for (const [name, value] of source) {
      target.set(name, value);
    }

    this.setVars(target);

    return this;
  }

  public isValid(): boolean {
    return this.#destinations.length > 0;
  }

  public build(options: UniKvsBuildOptions = {}): UniKvs<TKeyValueMapping> {
    // ストレージが空の場合は UniKvs として機能できないため、例外を投げます。
    if (this.#destinations.length === 0) {
      throw new MissingStorageError();
    }

    const beforeAll = options.beforeAll?.map((mw) => UniKvsMiddleware.from(mw)) ?? [];
    const beforeStorage = options.beforeStorage?.map((mw) => UniKvsMiddleware.from(mw)) ?? [];
    // ビルダーを再利用できるよう、挿入は build ごとの複製に対して行います。
    const destinations =
      beforeAll.length === 0 && beforeStorage.length === 0
        ? this.#destinations
        : this.#destinations.map((dest) => ({
            storage: dest.storage,
            middlewares: [...beforeAll, ...dest.middlewares, ...beforeStorage],
          }));

    return new UniKvs(
      [...this.#vars.entries()],
      // ビルダーを再利用できるよう、build のたびに trie をコンパイルします。コンパイル後の登録内容は変更しません。
      // 同じミドルウェアインスタンスに対するラッパーは共有します。
      PipelineGraph.compile(destinations),
      this.#valueSchemaResolver,
    );
  }
}
