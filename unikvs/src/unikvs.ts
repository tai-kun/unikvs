import {
  type IStorage,
  type VariablesInit,
  type VariablesEntry,
  type IReadableStream,
  Variables,
  RepairNotAllowedError,
} from "@unikvs/core";
import { combineSignals } from "abort-signal-utils";
import { type AsyncmuxLock, asyncmux, Asyncmux } from "asyncmux";

import { logger, repairLogger } from "./_logger.js";
import {
  type PipelineLeaf,
  type ResolvedLeaf,
  type StreamEncodeTarget,
  PipelineGraph,
} from "./_pipeline-graph.js";
import { cancelStreams, isReadableStream } from "./_streams.js";
import toValueStream from "./_to-value-stream.js";
import * as v from "./_valibot.js";
import type {
  Value,
  PlainValue,
  StreamValue,
  UniKvsSchema,
  ValueSchemaInfo,
  $InferPlainValueData,
  IValueSchemaResolver,
  $InferKeyValueMapping,
  $InferPlainValueInput,
  $InferStreamValueChunkData,
} from "./_value-schemas.js";
import {
  type KeyNotFoundErrorArgs,
  KeyNotFoundError,
  UniKvsIsOpenError,
  UniKvsIsNotOpenError,
  PluginOperationAggregateError,
} from "./errors.js";
import {
  type IUniKvsBranch,
  type KeyValueMapping,
  type KeyofKeyValueMapping,
  UniKvsBranch,
} from "./unikvs-branch.js";
import UniKvsConfig, {
  type UniKvsConfigOptions,
  type IUniKvsConfigBuilder,
} from "./unikvs-config.js";
import type { ValueOf } from "./utils.types.js";
import type { ValueStream } from "./value-stream.types.js";

// -------------------------------------------------------------------------------------------------
//
// ユーティリテー
//
// -------------------------------------------------------------------------------------------------

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

// -------------------------------------------------------------------------------------------------
//
// 値の検証
//
// -------------------------------------------------------------------------------------------------

/**
 * プレーン値専用のスキーマに ReadableStream が渡されたことを報告するためのスキーマです。
 */
const PlainValueInputSchema = v.pipe(
  v.unknown(),
  v.check(
    (input) => !isReadableStream(input),
    "Expected a plain value, but received a ReadableStream",
  ),
);

/**
 * ストリーム専用のスキーマにプレーン値が渡されたことを報告するためのスキーマです。
 */
const StreamValueInputSchema = v.pipe(
  v.unknown(),
  v.check(isReadableStream, "Expected a ReadableStream, but received a plain value"),
);

/**
 * スキーマ情報に基づいて `set` の入力値を検証します。
 *
 * プレーン値はその場で検証し、ストリームはチャンクごとに検証するストリームに変換します。
 *
 * @param info キーに対応するスキーマ情報です。
 * @param value 検証する入力値です。
 * @returns 検証済みの入力値を返します。
 */
function parseSetValue(info: ValueSchemaInfo, value: unknown): unknown {
  if (isReadableStream(value)) {
    if (info.kind === "plain") {
      // 必ず検証に失敗するため、InvalidInputError が投げられます。
      v.parseInput(PlainValueInputSchema, value);
    }

    // 入力チャンクを検証し、変換後の値を後続のパイプラインへ流します。
    return value.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          controller.enqueue(v.parseInput(info.schema, chunk));
        },
      }),
    );
  }

  if (info.kind === "stream") {
    // 必ず検証に失敗するため、InvalidInputError が投げられます。
    v.parseInput(StreamValueInputSchema, value);
  }

  return v.parseInput(info.schema, value);
}

// -------------------------------------------------------------------------------------------------
//
// スキーマ
//
// -------------------------------------------------------------------------------------------------

const VariablesKeySchema = v.string();

const VariablesInitSchema = v.union([
  v.custom<{ [Symbol.iterator](): Iterator<VariablesEntry> }>(
    // TODO(tai-kun): 各アイテムも要検証です。
    (input) => typeof input === "object" && !!input && Symbol.iterator in input,
    "Expected a Iterable object",
  ),
  v.record(VariablesKeySchema, v.unknown()),
]);

const OpenOptionsSchema = v.object({
  /**
   * 処理の中断を通知するためのシグナルです。
   */
  signal: v.optional(v.instance(AbortSignal)),

  /**
   * 実行時の変数です。
   */
  vars: v.optional(VariablesInitSchema),
});

const OpenArgsSchema = v.tuple([v.optional(OpenOptionsSchema)]);

const CloseOptionsSchema = v.object({
  /**
   * 処理の中断を通知するためのシグナルです。
   */
  signal: v.optional(v.instance(AbortSignal)),

  /**
   * 実行時の変数です。
   */
  vars: v.optional(VariablesInitSchema),
});

const CloseArgsSchema = v.tuple([v.optional(CloseOptionsSchema)]);

const SetOptionsSchema = v.object({
  key: v.string(),
  value: v.unknown(),
  signal: v.optional(v.instance(AbortSignal)),
  vars: v.optional(VariablesInitSchema),
});

const SetArgsSchema = v.union([
  v.tuple([SetOptionsSchema]),
  v.pipe(
    v.tuple([
      SetOptionsSchema.entries.key,
      SetOptionsSchema.entries.value,
      v.optional(v.omit(SetOptionsSchema, ["key", "value"])),
    ]),
    v.transform(([key, value, options]) => [{ ...options, key, value }]),
  ),
]);

const GetOptionsSchema = v.object({
  key: v.string(),
  repair: v.optional(v.boolean()),
  throwOnRepairDenied: v.optional(v.boolean()),
  signal: v.optional(v.instance(AbortSignal)),
  vars: v.optional(VariablesInitSchema),
});

const GetArgsSchema = v.union([
  v.tuple([GetOptionsSchema]),
  v.pipe(
    v.tuple([GetOptionsSchema.entries.key, v.optional(v.omit(GetOptionsSchema, ["key"]))]),
    v.transform(([key, options]) => [{ ...options, key }]),
  ),
]);

const StreamOptionsSchema = v.object({
  key: v.string(),
  repair: v.optional(v.boolean()),
  throwOnRepairDenied: v.optional(v.boolean()),
  signal: v.optional(v.instance(AbortSignal)),
  vars: v.optional(VariablesInitSchema),
});

const StreamArgsSchema = v.union([
  v.tuple([StreamOptionsSchema]),
  v.pipe(
    v.tuple([StreamOptionsSchema.entries.key, v.optional(v.omit(StreamOptionsSchema, ["key"]))]),
    v.transform(([key, options]) => [{ ...options, key }]),
  ),
]);

const HasOptionsSchema = v.object({
  key: v.string(),
  signal: v.optional(v.instance(AbortSignal)),
  vars: v.optional(VariablesInitSchema),
});

const HasArgsSchema = v.union([
  v.tuple([HasOptionsSchema]),
  v.pipe(
    v.tuple([HasOptionsSchema.entries.key, v.optional(v.omit(HasOptionsSchema, ["key"]))]),
    v.transform(([key, options]) => [{ ...options, key }]),
  ),
]);

const DeleteOptionsSchema = v.object({
  key: v.string(),
  signal: v.optional(v.instance(AbortSignal)),
  vars: v.optional(VariablesInitSchema),
});

const DeleteArgsSchema = v.union([
  v.tuple([DeleteOptionsSchema]),
  v.pipe(
    v.tuple([DeleteOptionsSchema.entries.key, v.optional(v.omit(DeleteOptionsSchema, ["key"]))]),
    v.transform(([key, options]) => [{ ...options, key }]),
  ),
]);

const ClearOptionsSchema = v.object({
  /**
   * 処理の中断を通知するためのシグナルです。
   */
  signal: v.optional(v.instance(AbortSignal)),

  /**
   * 実行時の変数です。
   */
  vars: v.optional(VariablesInitSchema),
});

const ClearArgsSchema = v.tuple([v.optional(ClearOptionsSchema)]);

// -------------------------------------------------------------------------------------------------
//
// 型定義
//
// -------------------------------------------------------------------------------------------------

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
export type GetOptions<TKey = IStorage.Key> = {
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
export type StreamOptions<TKey = IStorage.Key> = {
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
export type HasOptions<TKey = IStorage.Key> = {
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
export type DeleteOptions<TKey = IStorage.Key> = {
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
export type ClearOptions = v.InferInput<typeof ClearOptionsSchema>;

// -------------------------------------------------------------------------------------------------
//
// UniKvs
//
// -------------------------------------------------------------------------------------------------

/**
 * ストリームの読み取りロックを自動解放するための FinalizationRegistry です。
 */
const ioLockRegistry =
  typeof FinalizationRegistry !== "function"
    ? null
    : new FinalizationRegistry<IoLockRegistryHeld>((held) => {
        if (!held.lock.released) {
          held.lock.release();
        }

        // GC で回収された ValueStream のロックを解放し、ソースのリソースも破棄します。
        // dispose は valueStream を参照しないため、GC を妨げません。失敗したときはログに残すだけにします。
        held.dispose().catch((ex) => {
          logger.error`Failed to dispose value stream: ${ex}`;
        });
      });

type IoLockRegistryHeld = {
  /**
   * stream 操作で取得したキーの読み取りロックです。
   */
  readonly lock: AsyncmuxLock;

  /**
   * {@linkcode ValueStream.dispose} です。ソースストリームのキャンセルとロック解放を行います。
   */
  readonly dispose: () => Promise<void>;
};

/**
 * 接続状態を管理する内部オブジェクトです。
 */
type Connection = {
  /**
   * 接続全体を管理する AbortController です。
   */
  readonly ac: AbortController;

  /**
   * I/O の多重化を制御する Asyncmux インスタンスです。
   */
  readonly io: Asyncmux;
};

/**
 * プラグイン操作の失敗を集約するための 1 件分の記録です。
 */
type PluginErrorRecord = {
  /**
   * 失敗したプラグインの名前です。
   */
  readonly name: string;

  /**
   * 宛先またはプラグインの登録順 (0 起点) です。
   */
  readonly index: number;

  /**
   * 失敗の理由です。
   */
  readonly reason: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#config-builder)
 */
export type UniKvsDestination = PipelineLeaf;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#client-operations)
 */
export default class UniKvs<TKeyValueMapping extends KeyValueMapping = KeyValueMapping> {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#config-builder)
   */
  public static config<
    TKeyValueMapping extends KeyValueMapping,
  >(): IUniKvsConfigBuilder<TKeyValueMapping>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#config-builder)
   */
  public static config<const TSchema extends UniKvsSchema>(options: {
    readonly schema: TSchema;
  }): IUniKvsConfigBuilder<$InferKeyValueMapping<TSchema>>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#config-builder)
   */
  public static config(options?: UniKvsConfigOptions): IUniKvsConfigBuilder;

  public static config(options?: UniKvsConfigOptions): IUniKvsConfigBuilder<any> {
    return new UniKvsConfig(this, options);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#config-builder)
   */
  public static branch(): IUniKvsBranch {
    return new UniKvsBranch();
  }

  /**
   * 現在の接続状態です。非接続時は null となります。
   */
  #con: Connection | null;

  readonly #acSet: Set<AbortController>;

  /**
   * 基本となる実行変数情報です。
   */
  readonly #vars: Variables;

  /**
   * コンパイル済みのパイプライン・グラフです。
   */
  readonly #pipeline: PipelineGraph;

  /**
   * キーに対応する値のスキーマ情報を解決するリゾルバーです。スキーマ未設定時は null となります。
   */
  readonly #valueSchemaResolver: IValueSchemaResolver | null;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#client-operations)
   */
  public constructor(
    vars: VariablesInit,
    pipeline: PipelineGraph,
    valueSchemaResolver: IValueSchemaResolver | null = null,
  ) {
    this.#con = null;
    this.#acSet = new Set();
    this.#vars = new Variables(vars);
    this.#pipeline = pipeline;
    this.#valueSchemaResolver = valueSchemaResolver;
  }

  /**
   * キーに対応する値のスキーマ情報を解決します。
   *
   * @param key 解決するキーです。
   * @returns 対応するスキーマ情報を返します。スキーマ未設定または対応する定義がない場合は `undefined` を返します。
   */
  #resolveValueSchema(key: string): ValueSchemaInfo | undefined {
    return this.#valueSchemaResolver?.resolve(key);
  }

  /**
   * すべての宛先で読み取りに失敗したときのエラーを組み立てます。
   *
   * @param key 読み取ったキーです。
   * @param errors 収集した失敗です。
   * @returns `KeyNotFoundError` を返します。
   */
  #notFound(key: string, errors: readonly PluginErrorRecord[]): KeyNotFoundError {
    const args: KeyNotFoundErrorArgs = { key };
    switch (errors.length) {
      case 0:
        break;

      case 1:
        args.cause = errors[0]!.reason;
        break;

      default:
        args.cause = new PluginOperationAggregateError({
          plugin: "storage",
          action: "read",
          errors,
        });
    }

    return new KeyNotFoundError(args);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#client-operations)
   */
  public get isOpen(): boolean {
    return this.#con !== null;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#client-operations)
   */
  public open(options?: OpenOptions): Promise<void>;

  public async open(...args: any): Promise<void> {
    if (this.#con !== null) {
      throw new UniKvsIsOpenError();
    }

    const [options = {}] = v.parseInput(OpenArgsSchema, args);
    const { signal: signalOption, vars: varsOption } = options;

    const ac = new AbortController();
    const signal = combineSignals([ac.signal, signalOption]);

    const vars = this.#vars.clone(varsOption);
    vars.setReadonly("unikvs:action", "open");

    signal.throwIfAborted();

    this.#acSet.add(ac);

    const dispose: (() => Promise<void>)[] = [];
    let lock: AsyncmuxLock | undefined;

    try {
      lock = await asyncmux(this, signal);

      if (this.#con !== null) {
        throw new UniKvsIsOpenError();
      }

      const openFns: [
        () => Promise<void>,
        plugin: "storage" | "transformer",
        name: string,
        index: number,
      ][] = [];

      // open/close 用の vars はプラグインごとに複製し、並列実行中の変更が他に見えないようにします。
      // lifecycle は宛先固有ではないため unikvs:storageNames は付与しません。
      for (const [index, leaf] of this.#pipeline.leaves.entries()) {
        openFns.push([
          async () => {
            const pluginVars = vars.clone();
            await leaf.storage.open(pluginVars, signal);

            dispose.push(async () => {
              try {
                await leaf.storage.close(pluginVars, signal);
              } catch (ex) {
                logger.error`Failed to close storage: ${ex}`;
              }
            });
          },
          "storage",
          leaf.name,
          index,
        ]);
      }

      // 各トランスフォーマーのオープン処理をリストに追加します。
      // ストレージと同様にプラグインごとに複製し、並列実行中の変更が互いに見えないようにします。
      for (const [index, transformer] of this.#pipeline.transformers.entries()) {
        openFns.push([
          async () => {
            const pluginVars = vars.clone();
            await transformer.open(pluginVars, signal);

            dispose.push(async () => {
              try {
                await transformer.close(pluginVars, signal);
              } catch (ex) {
                logger.error`Failed to close transformer: ${ex}`;
              }
            });
          },
          "transformer",
          transformer.name,
          index,
        ]);
      }

      // すべての処理を並列に実行し、エラーが発生した場合は集約します。
      const errors: {
        plugin: "storage" | "transformer";
        name: string;
        index: number;
        reason: unknown;
      }[] = [];
      await Promise.all(
        openFns.map(async ([f, plugin, name, index]) => {
          try {
            await f();
          } catch (ex) {
            errors.push({ plugin, name, index, reason: ex });
          }
        }),
      );
      if (errors.length > 0) {
        // 中断以外の失敗が混ざっていないときは、abort 理由が集約エラーに埋もれないようそのまま投げます。
        if (signal.aborted && errors.every((error) => error.reason === signal.reason)) {
          throw signal.reason;
        }

        throw new PluginOperationAggregateError({ action: "open", errors });
      }

      // すべてのプラグインのオープンが成功した後も、待機中に中断されていないか最終確認します。
      // 中断済みのシグナルを持つ接続を作ると、isOpen が true なのに以降の操作がすべて即座に失敗する不整合な状態になります。
      signal.throwIfAborted();

      this.#con = {
        ac,
        io: new Asyncmux(),
      };
    } catch (ex) {
      if (dispose.length > 0) {
        await Promise.all(
          dispose.map(async (f) => {
            await f();
          }),
        );
      }

      throw ex;
    } finally {
      this.#acSet.delete(ac);
      lock?.release();
    }
  }

  async #close(vars: Variables, signal: AbortSignal, con: Connection): Promise<void> {
    const lock = await asyncmux(this, signal);
    try {
      // ロック待機中に接続状態が変更されていないか再確認します。
      if (this.#con !== con) {
        throw new UniKvsIsNotOpenError();
      }

      const { io } = this.#con;
      const lock = await io.lock({ signal });
      try {
        const closeFns: [
          () => Promise<void>,
          plugin: "storage" | "transformer",
          name: string,
          index: number,
        ][] = [];

        // ストレージのクローズ処理を登録します。
        // open と同じ方針でプラグインごとに複製し、並列実行中の変更が互いに見えないようにします。
        for (const [index, leaf] of this.#pipeline.leaves.entries()) {
          closeFns.push([
            async () => {
              await leaf.storage.close(vars.clone(), signal);
            },
            "storage",
            leaf.name,
            index,
          ]);
        }

        // トランスフォーマーのクローズ処理を登録します。
        for (const [index, plugin] of this.#pipeline.transformers.entries()) {
          closeFns.push([
            async () => {
              await plugin.close(vars.clone(), signal);
            },
            "transformer",
            plugin.name,
            index,
          ]);
        }

        // すべての処理を並列に実行し、エラーが発生した場合は集約します。
        const errors: {
          plugin: "storage" | "transformer";
          name: string;
          index: number;
          reason: unknown;
        }[] = [];
        await Promise.all(
          closeFns.map(async ([f, plugin, name, index]) => {
            try {
              await f();
            } catch (ex) {
              errors.push({ plugin, name, index, reason: ex });
            }
          }),
        );
        if (errors.length > 0) {
          throw new PluginOperationAggregateError({ action: "close", errors });
        }
      } finally {
        lock.release();
      }

      this.#con = null;
    } finally {
      lock.release();
    }
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#client-operations)
   */
  public close(options?: CloseOptions): Promise<void>;

  public close(...args: any): Promise<void> {
    try {
      const [options = {}] = v.parseInput(CloseArgsSchema, args);
      const { signal = AbortSignal.timeout(10e3), vars: varsOption } = options;

      const vars = this.#vars.clone(varsOption);
      vars.setReadonly("unikvs:action", "close");

      if (this.#con === null) {
        const acArr = [...this.#acSet];
        this.#acSet.clear();
        for (const ac of acArr) {
          if (!ac.signal.aborted) {
            ac.abort(new UniKvsIsNotOpenError());
          }
        }

        throw new UniKvsIsNotOpenError();
      }

      const con = this.#con;
      const { ac } = con;
      const acArr = [ac, ...this.#acSet];
      this.#acSet.clear();
      for (const ac of acArr) {
        if (!ac.signal.aborted) {
          ac.abort(new UniKvsIsNotOpenError());
        }
      }

      return this.#close(vars, signal, con).catch(async (ex) => {
        // #close が失敗した場合、コネクションの AbortController はすでに abort 済みで、以降の操作がすべて即座に失敗する不整合な状態になります。
        // そこで接続を破棄して isOpen=false の一貫した状態に戻し、プラグインのクローズ処理はできる範囲で実行します。
        if (this.#con === con) {
          this.#con = null;

          const disposeSignal = AbortSignal.timeout(10e3);
          await Promise.all(
            [
              ...this.#pipeline.leaves.map((leaf) => leaf.storage),
              ...this.#pipeline.transformers,
            ].map(async (plugin) => {
              try {
                await plugin.close(vars.clone(), disposeSignal);
              } catch (ex) {
                logger.error`Failed to close plugin after close failure: ${ex}`;
              }
            }),
          );
        }

        throw ex;
      });
    } catch (ex) {
      return Promise.reject(ex);
    }
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#client-operations)
   */
  async [Symbol.asyncDispose](): Promise<void> {
    if (!this.isOpen) {
      return;
    }

    await this.close({
      signal: AbortSignal.timeout(10e3),
    });
  }

  /**
   * 書き込み失敗の集約と、成功した宛先への通知を行います。
   *
   * @param targets 書き込みを試みた対象です。
   * @param failed 失敗した葉の集合です。
   * @param errors 集約する失敗です。
   * @param signal 中断シグナルです。
   */
  async #finishWrites(
    targets: readonly {
      readonly leaf: PipelineLeaf;
      readonly vars: Variables;
      readonly key: string;
    }[],
    failed: ReadonlySet<PipelineLeaf>,
    errors: PluginErrorRecord[],
    signal: AbortSignal,
  ): Promise<void> {
    if (errors.length === 0) {
      return;
    }

    const error = new PluginOperationAggregateError({
      plugin: "storage",
      action: "write",
      errors,
    });
    const notifyErrors: unknown[] = [];
    await Promise.all(
      targets.map(async (target) => {
        // 失敗した宛先を除いたすべての宛先へ通知します。通知に失敗しても元の集約エラーは置き換えません。
        if (failed.has(target.leaf)) {
          return;
        }

        try {
          await target.leaf.storage.onOtherWriteError(target.vars, signal, target.key, error);
        } catch (ex) {
          notifyErrors.push(ex);
        }
      }),
    );
    if (notifyErrors.length > 0) {
      logger.error(new AggregateError(notifyErrors, "Failed to handle error"));
    }

    throw error;
  }

  /**
   * プレーン値の並列書き込みを行います。
   *
   * @param io 多重化インスタンスです。
   * @param signal 中断シグナルです。
   * @param key 書き込みキーです。
   * @param rootVars 根の vars です。
   * @param value 書き込む値です。
   */
  async #setPlain(
    io: Asyncmux,
    signal: AbortSignal,
    key: string,
    rootVars: Variables,
    value: unknown,
  ): Promise<void> {
    const targets = await this.#pipeline.encode(rootVars, key, signal, value);
    const lock = await io.lock({ key, signal });
    try {
      const errors: PluginErrorRecord[] = [];
      const failed = new Set<PipelineLeaf>();
      await Promise.all(
        targets.map(async (target) => {
          try {
            await target.leaf.storage.write(target.vars, signal, target.key, target.data);
          } catch (ex) {
            errors.push({ name: target.leaf.name, index: target.leaf.index, reason: ex });
            failed.add(target.leaf);
          }
        }),
      );

      await this.#finishWrites(targets, failed, errors, signal);
    } finally {
      lock.release();
    }
  }

  /**
   * ストリーム値の並列書き込みを行います。
   *
   * @param io 多重化インスタンスです。
   * @param signal 中断シグナルです。
   * @param key 書き込みキーです。
   * @param rootVars 根の vars です。
   * @param value 書き込むストリームです。
   */
  async #setStream(
    io: Asyncmux,
    signal: AbortSignal,
    key: string,
    rootVars: Variables,
    value: IReadableStream,
  ): Promise<void> {
    const streams = new Set<IReadableStream>([value]);
    let tree;
    try {
      tree = await this.#pipeline.buildEncodeTree(value, rootVars, key, signal, streams);
    } catch (ex) {
      await cancelStreams(streams, ex);
      throw ex;
    }

    const lock = await io.lock({ key, signal }).catch(async (ex) => {
      // キーロックの待機中に中断されたときも、構築済みのストリームをキャンセルします。
      // ソースストリームをロックしたまま残さないためです。
      await cancelStreams(streams, ex);
      throw ex;
    });

    try {
      const errors: PluginErrorRecord[] = [];
      const failed = new Set<PipelineLeaf>();
      await Promise.all(
        tree.targets.map(async (target) => {
          try {
            const w = await target.leaf.storage.getWritable(target.vars, signal, target.key);
            await target.stream.pipeTo(w, { signal });
          } catch (ex) {
            // tee で分岐したストリームは、片方の分岐をキャンセルするまで他方が読み取ったチャンクを保持し続けるため、失敗時に放棄した分岐は確実にキャンセルします。
            try {
              await target.stream.cancel(ex);
            } catch {
              // キャンセルに失敗してもエラー集約を優先します。
            }

            errors.push({ name: target.leaf.name, index: target.leaf.index, reason: ex });
            failed.add(target.leaf);
          }
        }),
      );

      await this.#finishWrites(tree.targets, failed, errors, signal);
    } finally {
      lock.release();
    }
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#client-operations)
   */
  public set<const TKey extends KeyofKeyValueMapping<TKeyValueMapping>>(
    options: SetOptions<TKeyValueMapping, TKey>,
  ): Promise<void>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#client-operations)
   */
  public set<const TKey extends KeyofKeyValueMapping<TKeyValueMapping>>(
    key: TKey,
    value: SetValue<TKeyValueMapping[TKey]>,
    options?: Omit<SetOptions, "key" | "value">,
  ): Promise<void>;

  public async set(...args: any): Promise<void> {
    if (this.#con === null) {
      throw new UniKvsIsNotOpenError();
    }

    const [options] = v.parseInput(SetArgsSchema, args);
    const { key, signal: signalOption, vars: varsOption } = options;

    const valueSchema = this.#resolveValueSchema(key);
    // スキーマ検証はロック取得前に済ませ、無効な入力ではロックを取得しません。
    const value = valueSchema ? parseSetValue(valueSchema, options.value) : options.value;

    const { ac, io } = this.#con;
    const signal = combineSignals([ac.signal, signalOption]);

    const vars = this.#vars.clone(varsOption);
    vars.setReadonly("unikvs:action", "set");
    vars.setReadonly("unikvs:key", key);

    const lock = await asyncmux.readonly(this, signal);
    try {
      // ロック待機中に接続状態が変更されていないか再確認します。
      if (this.#con === null) {
        throw new UniKvsIsNotOpenError();
      }

      // ロックはインスタンス (読み取り) からキーの順で取得し、逆順で解放します。
      const rootVars = this.#pipeline.prepareRootVars(vars);
      if (isReadableStream(value)) {
        await this.#setStream(io, signal, key, rootVars, value);
      } else {
        await this.#setPlain(io, signal, key, rootVars, value);
      }
    } finally {
      lock.release();
    }
  }

  /**
   * 読み取り元のチェーン全体を逆順にデコードし、書き戻し対象向けに再エンコードして書き込みます。
   *
   * @param data 読み取ったデータです。
   * @param hit 読み取り元の葉です。
   * @param missing 読み取りに失敗または不在だった葉です。
   * @param rootVars 根の vars です。
   * @param key キーです。
   * @param signal 中断シグナルです。
   * @param throwOnRepairDenied 書き戻し拒否をエラーとして投げるかどうかです。
   * @returns デコード済みの原データを返します。
   */
  async #repairPlain(
    data: unknown,
    hit: ResolvedLeaf,
    missing: readonly PipelineLeaf[],
    rootVars: Variables,
    key: string,
    signal: AbortSignal,
    throwOnRepairDenied: boolean,
  ): Promise<unknown> {
    // unikvs:repair は書き戻しによる書き込みだけを示す目印です。
    const repairVars: Variables = rootVars.clone();
    repairVars.setReadonly("unikvs:repair", true);

    const raw = await this.#pipeline.decode(hit.leaf, hit.vars, signal, data);

    await this.#pipeline.repair(repairVars, key, signal, missing, throwOnRepairDenied, raw);

    signal.throwIfAborted();

    return raw;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#client-operations)
   */
  public get<const TKey extends KeyofKeyValueMappingHasPlainValue<TKeyValueMapping>>(
    options: GetOptions<TKey>,
  ): Promise<$InferPlainValueData<TKeyValueMapping[TKey]>>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#client-operations)
   */
  public get<const TKey extends KeyofKeyValueMappingHasPlainValue<TKeyValueMapping>>(
    key: TKey,
    options?: Omit<GetOptions, "key">,
  ): Promise<$InferPlainValueData<TKeyValueMapping[TKey]>>;

  public async get(...args: any): Promise<unknown> {
    if (this.#con === null) {
      throw new UniKvsIsNotOpenError();
    }

    const [options] = v.parseInput(GetArgsSchema, args);
    const {
      key,
      vars: varsOption,
      repair = false,
      signal: signalOption,
      throwOnRepairDenied = false,
    } = options;

    const valueSchema = this.#resolveValueSchema(key);

    const { ac, io } = this.#con;
    const signal = combineSignals([ac.signal, signalOption]);

    const vars = this.#vars.clone(varsOption);
    vars.setReadonly("unikvs:action", "get");
    vars.setReadonly("unikvs:key", key);

    const lock = await asyncmux.readonly(this, signal);
    try {
      // ロック待機中に接続状態が変更されていないか再確認します。
      if (this.#con === null) {
        throw new UniKvsIsNotOpenError();
      }

      const rootVars = this.#pipeline.prepareRootVars(vars);

      let data: unknown = undefined;
      let hit: ResolvedLeaf | null = null;
      const missing: PipelineLeaf[] = [];
      const errors: PluginErrorRecord[] = [];

      // 書き戻し時は、読み取りから書き込みまでを同じキーの書き込みと直列化するため、書き込みロックを取得します。
      const lock = await (repair ? io.lock({ key, signal }) : io.rLock({ key, signal }));
      try {
        // 登録順が読み取りの優先順です。先頭で見つかればそこで終え、失敗したときは次の宛先を試します。
        const resolver = this.#pipeline.createResolver(rootVars, key, signal);
        for (const leaf of this.#pipeline) {
          const resolved = await resolver.resolve(leaf);
          try {
            if (!(await leaf.storage.exists(resolved.vars, signal, resolved.key))) {
              missing.push(leaf);
              continue;
            }

            data = await leaf.storage.read(resolved.vars, signal, resolved.key);
            hit = resolved;
            break;
          } catch (ex) {
            if (signal.aborted) {
              throw ex;
            }

            errors.push({ name: leaf.name, index: leaf.index, reason: ex });
            logger.error`Failed to read from a storage: ${ex}`;
          }
        }

        if (hit === null) {
          throw this.#notFound(key, errors);
        }

        if (repair) {
          // 後段で見つかったデータをすべてデコードして原データに戻します。
          data = await this.#repairPlain(
            data,
            hit,
            missing,
            rootVars,
            key,
            signal,
            throwOnRepairDenied,
          );
        }
      } finally {
        lock.release();
      }

      if (!repair) {
        // 見つかったストレージ専用の前段パイプラインを逆順に適用して、データをデコードします。
        data = await this.#pipeline.decode(hit.leaf, hit.vars, signal, data);
      }

      // デコード後のデータを検証します。
      if (valueSchema) {
        data = v.parseOutput(valueSchema.schema, data);
      }

      return data;
    } finally {
      lock.release();
    }
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#value-stream)
   */
  public stream<const TKey extends KeyofKeyValueMappingHasStreamValue<TKeyValueMapping>>(
    options: StreamOptions<TKey>,
  ): Promise<ValueStream<$InferStreamValueChunkData<TKeyValueMapping[TKey]>>>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#value-stream)
   */
  public stream<const TKey extends KeyofKeyValueMappingHasStreamValue<TKeyValueMapping>>(
    key: TKey,
    options?: Omit<StreamOptions, "key">,
  ): Promise<ValueStream<$InferStreamValueChunkData<TKeyValueMapping[TKey]>>>;

  public async stream(...args: any): Promise<ValueStream> {
    if (this.#con === null) {
      throw new UniKvsIsNotOpenError();
    }

    const [options] = v.parseInput(StreamArgsSchema, args);
    const {
      key,
      repair = false,
      throwOnRepairDenied = false,
      signal: signalOption,
      vars: varsOption,
    } = options;

    const valueSchema = this.#resolveValueSchema(key);

    const { ac, io } = this.#con;
    const signal = combineSignals([ac.signal, signalOption]);

    const vars = this.#vars.clone(varsOption);
    vars.setReadonly("unikvs:action", "stream");
    vars.setReadonly("unikvs:key", key);

    const lock = await asyncmux.readonly(this, signal);
    try {
      // ロック待機中に接続状態が変更されていないか再確認します。
      if (this.#con === null) {
        throw new UniKvsIsNotOpenError();
      }

      const rootVars = this.#pipeline.prepareRootVars(vars);

      // NONE は getReadable の呼び出し前を表す番兵値です。
      const NONE: any = {};
      let r: IReadableStream = NONE;
      let hit: ResolvedLeaf | null = null;
      const missing: PipelineLeaf[] = [];
      const errors: PluginErrorRecord[] = [];
      const fillBranches: IReadableStream[] = [];
      const fillTasks: Promise<void>[] = [];
      let repairAc: AbortController | null = null;
      let cancelFills: ((reason: unknown) => Promise<void>) | null = null;

      // 書き戻し時は、読み取りから書き込みまでを同じキーの書き込みと直列化するため、書き込みロックを取得します。
      const lock = await (repair ? io.lock({ key, signal }) : io.rLock({ key, signal }));
      try {
        // 登録順が読み取りの優先順です。先頭で見つかればそこで終え、失敗したときは次の宛先を試します。
        const resolver = this.#pipeline.createResolver(rootVars, key, signal);
        for (const leaf of this.#pipeline) {
          const resolved = await resolver.resolve(leaf);
          try {
            if (!(await leaf.storage.exists(resolved.vars, signal, resolved.key))) {
              missing.push(leaf);
              continue;
            }

            r = await leaf.storage.getReadable(resolved.vars, signal, resolved.key);
            hit = resolved;
            break;
          } catch (ex) {
            if (signal.aborted) {
              throw ex;
            }

            errors.push({ name: leaf.name, index: leaf.index, reason: ex });
            logger.error`Failed to read from a storage: ${ex}`;
          }
        }

        if (hit === null) {
          throw this.#notFound(key, errors);
        }

        // 書き戻しが有効なときだけ、ストリームが途中で破棄されたら進行中の書き戻しも中断できるようにします。
        repairAc = repair ? new AbortController() : null;
        const repairSignal = repairAc ? combineSignals([signal, repairAc.signal]) : signal;

        // 書き戻しによる書き込みだと分かるよう、書き込み専用の変数を用意します。
        const repairVars: Variables = (() => {
          if (!repair) {
            return rootVars;
          }
          const cloned = rootVars.clone();
          cloned.setReadonly("unikvs:repair", true);
          return cloned;
        })();

        // 書き戻しはできる範囲で行います。失敗してもログに残すだけで、読み取りは続けます。
        const fill = (target: StreamEncodeTarget): void => {
          fillBranches.push(target.stream);
          fillTasks.push(
            (async () => {
              try {
                const w = await target.leaf.storage.getWritable(
                  target.vars,
                  repairSignal,
                  target.key,
                );
                await target.stream.pipeTo(w, { signal: repairSignal });
              } catch (ex) {
                // パイプが中断されたときは分岐を解放し、tee が後続のチャンクを保持し続けないようにします。
                try {
                  await target.stream.cancel(ex);
                } catch {}

                // 意図的な中断時はエラーではありません。
                if (repairSignal.aborted) {
                  return;
                }
                if (ex instanceof RepairNotAllowedError) {
                  repairLogger.warn`Failed to repair a storage: ${ex}`;

                  return;
                }

                logger.error`Failed to repair a storage: ${ex}`;
              }
            })(),
          );
        };

        // セットアップに失敗したときは、構築済みの分岐と進行中の書き戻しを中断します。
        cancelFills = async (reason) => {
          repairAc?.abort(reason);
          await Promise.all(
            fillBranches.map(async (branch) => {
              try {
                await branch.cancel(reason);
              } catch {}
            }),
          );
          await Promise.all(fillTasks);
        };

        // 読み取り元をすべてデコードして原データに戻します。
        // 書き戻しの分岐は読み取りパスと分離します。
        r = await this.#pipeline.decodeStream(hit.leaf, hit.vars, signal, r);

        if (repair) {
          // 許可のない宛先を先に除外します。throwOnRepairDenied が真のときはここでエラーを確定します。
          const repairSet = new Set<PipelineLeaf>();
          for (const leaf of missing) {
            if (!leaf.canRepair) {
              // 意図的な中断時はエラーではありません。
              if (signal.aborted) {
                continue;
              }

              repairLogger.warn`Skipped repair for a storage without AllowRepair: ${leaf.name}`;

              if (throwOnRepairDenied) {
                throw new RepairNotAllowedError({ names: [leaf.name] });
              }

              continue;
            }

            repairSet.add(leaf);
          }

          if (repairSet.size > 0) {
            // 読み取りパスを変更しないよう、書き戻し側だけを構築して分岐後の読み取り側を返します。
            const streams = new Set<IReadableStream>([r]);
            const tree = await this.#pipeline.buildEncodeTree(r, repairVars, key, signal, streams, {
              isActive: (leaf) => repairSet.has(leaf),
              splitRead: true,
              onNodeError: (ex, activeLeaves) => {
                // 意図的な中断時は中断理由で失敗します。
                if (signal.aborted) {
                  signal.throwIfAborted();
                }
                if (ex instanceof RepairNotAllowedError) {
                  repairLogger.warn`Failed to repair a storage: ${ex}`;

                  if (throwOnRepairDenied) {
                    throw new RepairNotAllowedError({
                      names: activeLeaves.map((leaf) => leaf.name),
                      cause: ex,
                    });
                  }

                  return true;
                }

                logger.error`Failed to repair a storage: ${ex}`;

                throw ex;
              },
            });
            r = tree.readStream;
            for (const target of tree.targets) {
              fill(target);
            }
          }

          signal.throwIfAborted();
        }

        // デコード後のチャンクを検証します。
        if (valueSchema) {
          r = r.pipeThrough(
            new TransformStream({
              transform(chunk, controller) {
                controller.enqueue(v.parseOutput(valueSchema.schema, chunk));
              },
            }),
          );
        }

        // ストリームを読み切ったかを監視します。読み切ったときは書き戻しの完了を待ち、途中で破棄されたときは書き戻しを中断します。
        let completed = false;
        if (repairAc) {
          r = r.pipeThrough(
            new TransformStream({
              transform(chunk, controller) {
                controller.enqueue(chunk);
              },
              flush() {
                completed = true;
              },
            }),
          );
        }

        // 破棄時は、ソースストリームをキャンセルする前に進行中の書き戻しを中断します。
        // tee で分岐したストリームはすべての分岐のキャンセルが揃うまで元のキャンセルが完了しないためです。
        const beforeDispose = (): void => {
          if (!completed) {
            repairAc?.abort(signal.reason);
          }
        };

        // キーロックは ValueStream の dispose まで保持します。fill の完了を待ってから解放します。
        const dispose = async (): Promise<void> => {
          try {
            await Promise.all(fillTasks);
          } finally {
            try {
              lock.release();
            } catch {}
          }
        };

        if (!ioLockRegistry) {
          return toValueStream(r, dispose, beforeDispose);
        }

        const unregisterToken = {};
        const valueStream = toValueStream(
          r,
          async () => {
            try {
              ioLockRegistry.unregister(unregisterToken);
            } catch {}
            await dispose();
          },
          beforeDispose,
        );

        // valueStream が GC される時点でストリームが終わっていなければロックを自動解放します。あわせて、ソースストリームが保持するリソース (S3 レスポンスボディなど) を解放できるよう dispose を記録します。
        ioLockRegistry.register(
          valueStream,
          {
            lock,
            dispose: valueStream.dispose,
          },
          unregisterToken,
        );

        return valueStream;
      } catch (ex) {
        await cancelFills?.(ex);

        if (r !== NONE) {
          // getReadable の成功後にセットアップで失敗したときは、ソースストリームが保持するリソース (S3 レスポンスボディなど) を解放するためキャンセルします。
          try {
            await r.cancel(ex);
          } catch {}
        }

        lock.release();
        throw ex;
      }
    } finally {
      lock.release();
    }
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#client-operations)
   */
  public has(options: HasOptions<KeyofKeyValueMapping<TKeyValueMapping>>): Promise<boolean>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#client-operations)
   */
  public has(
    key: KeyofKeyValueMapping<TKeyValueMapping>,
    options?: Omit<HasOptions, "key">,
  ): Promise<boolean>;

  public async has(...args: any): Promise<boolean> {
    if (this.#con === null) {
      throw new UniKvsIsNotOpenError();
    }

    const [options] = v.parseInput(HasArgsSchema, args);
    const { key, signal: signalOption, vars: varsOption } = options;

    // キーがキースキーマに一致するかを検証します。
    this.#resolveValueSchema(key);

    const { ac, io } = this.#con;
    const signal = combineSignals([ac.signal, signalOption]);

    const vars = this.#vars.clone(varsOption);
    vars.setReadonly("unikvs:action", "has");
    vars.setReadonly("unikvs:key", key);

    const lock = await asyncmux.readonly(this, signal);
    try {
      // ロック待機中に接続状態が変更されていないか再確認します。
      if (this.#con === null) {
        throw new UniKvsIsNotOpenError();
      }

      const rootVars = this.#pipeline.prepareRootVars(vars);
      const lock = await io.rLock({ key, signal });
      try {
        // 登録順に走査し、いずれかのストレージに存在すれば true を返します。
        // exists に失敗したときは次のストレージを試します。
        const errors: PluginErrorRecord[] = [];
        const resolver = this.#pipeline.createResolver(rootVars, key, signal);
        for (const leaf of this.#pipeline) {
          const resolved = await resolver.resolve(leaf);
          try {
            if (await leaf.storage.exists(resolved.vars, signal, resolved.key)) {
              return true;
            }
          } catch (ex) {
            if (signal.aborted) {
              throw ex;
            }
            errors.push({ name: leaf.name, index: leaf.index, reason: ex });

            logger.error`Failed to check existence in a storage: ${ex}`;
          }
        }

        // すべてのストレージで存在を確認できなかったときは結果が不明なため、get() と同様にエラーとして報告します。
        if (errors.length > 0) {
          throw this.#notFound(key, errors);
        }

        return false;
      } finally {
        lock.release();
      }
    } finally {
      lock.release();
    }
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#client-operations)
   */
  public delete(options: DeleteOptions<KeyofKeyValueMapping<TKeyValueMapping>>): Promise<void>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#client-operations)
   */
  public delete(
    key: KeyofKeyValueMapping<TKeyValueMapping>,
    options?: Omit<DeleteOptions, "key">,
  ): Promise<void>;

  public async delete(...args: any): Promise<void> {
    if (this.#con === null) {
      throw new UniKvsIsNotOpenError();
    }

    const [options] = v.parseInput(DeleteArgsSchema, args);
    const { key, signal: signalOption, vars: varsOption } = options;

    // キーがキースキーマに一致するかを検証します。
    this.#resolveValueSchema(key);

    const { ac, io } = this.#con;
    const signal = combineSignals([ac.signal, signalOption]);

    const vars = this.#vars.clone(varsOption);
    vars.setReadonly("unikvs:action", "delete");
    vars.setReadonly("unikvs:key", key);

    const lock = await asyncmux.readonly(this, signal);
    try {
      // ロック待機中に接続状態が変更されていないか再確認します。
      if (this.#con === null) {
        throw new UniKvsIsNotOpenError();
      }

      const rootVars = this.#pipeline.prepareRootVars(vars);
      const lock = await io.lock({ key, signal });
      try {
        // 全宛先を並列に削除し、失敗は宛先の index 付きで集約します。
        const errors: PluginErrorRecord[] = [];
        const resolver = this.#pipeline.createResolver(rootVars, key, signal);
        await Promise.all(
          this.#pipeline.leaves.map(async (leaf) => {
            const resolved = await resolver.resolve(leaf);
            try {
              if (await leaf.storage.exists(resolved.vars, signal, resolved.key)) {
                await leaf.storage.delete(resolved.vars, signal, resolved.key);
              }
            } catch (ex) {
              errors.push({ name: leaf.name, index: leaf.index, reason: ex });
            }
          }),
        );
        if (errors.length > 0) {
          throw new PluginOperationAggregateError({ plugin: "storage", action: "delete", errors });
        }
      } finally {
        lock.release();
      }
    } finally {
      lock.release();
    }
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#client-operations)
   */
  public async clear(options?: ClearOptions): Promise<void>;

  public async clear(...args: any): Promise<void> {
    if (this.#con === null) {
      throw new UniKvsIsNotOpenError();
    }

    const [options = {}] = v.parseInput(ClearArgsSchema, args);
    const { signal: signalOption, vars: varsOption } = options;

    const { ac, io } = this.#con;
    const signal = combineSignals([ac.signal, signalOption]);

    const vars = this.#vars.clone(varsOption);
    vars.setReadonly("unikvs:action", "clear");

    const lock = await asyncmux.readonly(this, signal);
    try {
      // ロック待機中に接続状態が変更されていないか再確認します。
      if (this.#con === null) {
        throw new UniKvsIsNotOpenError();
      }

      const rootVars = this.#pipeline.prepareRootVars(vars);
      // 全宛先の名前空間ごとに onClear を順に実行します。
      // 葉が1件だけのときは根の vars をそのまま使います。
      const clearVars = this.#pipeline.prepareClearVars(rootVars);
      const lock = await io.lock({ signal });
      try {
        for (const transformer of this.#pipeline.transformers) {
          signal.throwIfAborted();
          await transformer.onClear(clearVars, signal);
        }

        // set や repair と同じく onClear による変更を引き継ぐため、実行後の clearVars から分岐します。
        const clearDestVars = this.#pipeline.leaves.map((leaf) =>
          this.#pipeline.deriveLeafVars(clearVars, leaf),
        );

        // 一括削除は全宛先で並列に実行し、失敗は宛先の index 付きで集約します。
        const errors: PluginErrorRecord[] = [];
        await Promise.all(
          this.#pipeline.leaves.map(async (leaf, index) => {
            try {
              await leaf.storage.clear(clearDestVars[index]!, signal);
            } catch (ex) {
              errors.push({ name: leaf.name, index, reason: ex });
            }
          }),
        );
        if (errors.length > 0) {
          throw new PluginOperationAggregateError({ plugin: "storage", action: "clear", errors });
        }
      } finally {
        lock.release();
      }
    } finally {
      lock.release();
    }
  }
}
