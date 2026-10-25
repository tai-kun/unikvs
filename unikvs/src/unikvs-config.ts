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
import type { GenericSchema } from "./_valibot.js";
import {
  array,
  tuple,
  union,
  custom,
  object,
  record,
  string,
  optional,
  parseInput,
} from "./_valibot.js";
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
      [TLastMiddlewareEncodeChunkOutput] extends [never] ? any : TLastMiddlewareEncodeChunkOutput
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
      [TLastMiddlewareEncodeChunkOutput] extends [never] ? any : TLastMiddlewareEncodeChunkOutput
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

  create(): UniKvs<TKeyValueMapping>;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#config-builder)
 */
export type UniKvsConfigOptions = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#base-vars)
   */
  readonly vars?: VariablesInit | undefined;
  readonly schema?: UniKvsSchema | undefined;
};

/**
 * オブジェクト形式のスキーマ定義です。キーをそのままキーとして扱います。
 */
export type UniKvsSchemaRecord = Readonly<Record<string, Value>>;

/**
 * 配列形式のスキーマ定義です。キーのスキーマと値のスキーマの組を並べます。
 */
export type UniKvsSchemaEntries = readonly (readonly [GenericSchema, Value])[];

/**
 * `UniKvs.config()` の `schema` オプションに指定できるスキーマ定義です。
 */
export type UniKvsSchema = UniKvsSchemaRecord | UniKvsSchemaEntries;

/**
 * 値が Valibot のスキーマであるかどうかを判定します。
 */
function isGenericSchema(input: unknown): input is GenericSchema {
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

const UniKvsConfigOptionsSchema = object({
  /**
   * キーと値のスキーマ定義です。
   */
  schema: optional(
    union([
      array(
        tuple([custom<GenericSchema>(isGenericSchema), custom<ValueSchemaInfo>(isValueSchemaInfo)]),
      ),
      record(string(), custom<ValueSchemaInfo>(isValueSchemaInfo)),
    ]),
  ),

  /**
   * 基本となる実行時変数です。
   */
  vars: optional(VariablesInitSchema),
});

const UniKvsConfigArgsSchema = tuple([optional(UniKvsConfigOptionsSchema)]);

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

  /**
   * 基本となる実行時変数です。
   *
   * 各操作の `vars` と結合して使用されます。
   */
  readonly #vars: Map<string, unknown>;

  /**
   * @internal
   */
  public constructor(UniKvsConstructor: typeof UniKvs, options?: UniKvsConfigOptions);
  public constructor(UniKvsConstructor: typeof UniKvs, ...args: unknown[]) {
    const [{ vars, schema } = {}] = parseInput(UniKvsConfigArgsSchema, args);

    this.#UniKvs = UniKvsConstructor;
    this.#destinations = [];
    this.#middlewares = [];
    this.#valueSchemaResolver = null;
    this.#vars = new Map(vars);
    if (schema) {
      this.#valueSchemaResolver = createValueSchemaResolver(schema);
    }
  }

  public fork(branch: IUniKvsBranch): this {
    appendForkDestinations(this.#destinations, this.#middlewares, branch);

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

  public setVars(vars: VariablesInit): this;
  public setVars(...args: unknown[]): this {
    const [vars] = parseInput(VariablesArgsSchema, args);

    this.#vars.clear();
    for (const [name, value] of vars) {
      this.#vars.set(name, value);
    }

    return this;
  }

  public assignVars(vars: VariablesInit): this;
  public assignVars(...args: unknown[]): this {
    const [vars] = parseInput(VariablesArgsSchema, args);

    const target = this.#vars;
    const source = vars;

    for (const [name, value] of source) {
      target.set(name, value);
    }

    return this;
  }

  public defaultsVars(vars: VariablesInit): this;
  public defaultsVars(...args: unknown[]): this {
    const [vars] = parseInput(VariablesArgsSchema, args);

    const target = new Map(vars);
    const source = this.#vars;

    for (const [name, value] of source) {
      target.set(name, value);
    }

    this.setVars(target);

    return this;
  }

  public create(): UniKvs {
    // ストレージが空の場合は UniKvs として機能できないため、例外を投げます。
    if (this.#destinations.length === 0) {
      throw new MissingStorageError();
    }

    return new this.#UniKvs(
      [...this.#vars.entries()],
      // ビルダーを再利用できるよう、create のたびに trie をコンパイルします。コンパイル後の登録内容は変更しません。
      // 同じミドルウェアインスタンスに対するラッパーは共有します。
      PipelineGraph.compile([...this.#destinations]),
      this.#valueSchemaResolver,
    );
  }
}
