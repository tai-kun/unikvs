import type { Variables, IStorage, IReadableStream } from "@unikvs/core";
import { RepairNotAllowedError } from "@unikvs/core";
import { combineSignals } from "abort-signal-utils";
import { type AsyncmuxLock, asyncmux, Asyncmux } from "asyncmux";

import { logger, repairLogger } from "./_logger.js";
import mergeVariables from "./_merge-variables.js";
import UniKvsStorage from "./_storage.js";
import { isReadableStream } from "./_streams.js";
import toValueStream from "./_to-value-stream.js";
import UniKvsTransformer from "./_transformer.js";
import * as v from "./_valibot.js";
import {
  type KeyNotFoundErrorArgs,
  KeyNotFoundError,
  UniKvsIsOpenError,
  UniKvsIsNotOpenError,
  PluginOperationAggregateError,
} from "./errors.js";
import UniKvsConfig, {
  type Value,
  type PlainValue,
  type StreamValue,
  type UniKvsSchema,
  type KeyValueMapping,
  type ValueSchemaInfo,
  type IUniKvsBranch,
  type UniKvsConfigOptions,
  type $InferPlainValueData,
  type IUniKvsConfigBuilder,
  type IValueSchemaResolver,
  type KeyofKeyValueMapping,
  type $InferKeyValueMapping,
  type $InferPlainValueInput,
  type $InferStreamValueChunkData,
  UniKvsBranch,
} from "./unikvs-config.js";
import type { ValueOf } from "./utils.types.js";
import type { ValueStream } from "./value-stream.types.js";
import type { VariablesSource } from "./variables.types.js";

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

// 指定されたストリームをすべてキャンセルします。
async function cancelAllBranches(
  streams: Iterable<{ cancel(reason?: unknown): Promise<void> }>,
  reason: unknown,
): Promise<void> {
  await Promise.all(
    [...new Set(streams)].map(async (stream) => {
      try {
        await stream.cancel(reason);
      } catch {
        // キャンセルに失敗しても元の例外の伝播を優先します。
      }
    }),
  );
}

// 宛先単位の vars を生成します。
// ストレージ名を単一要素の凍結配列として付与します。
function withStorageNames(vars: Variables, name: string): Variables {
  return { ...vars, "unikvs:storageNames": Object.freeze([name]) };
}

// 共有実行用の vars を生成します。
// 呼び出し側が順序を保証します。
// 空配列では呼び出しません。
function withStorageNamesForMany(vars: Variables, names: readonly string[]): Variables {
  return { ...vars, "unikvs:storageNames": Object.freeze([...names]) };
}

// -------------------------------------------------------------------------------------------------
//
// スキーマ
//
// -------------------------------------------------------------------------------------------------

const VariablesKeySchema = v.string();

// 配列形式の vars も正当な入力であるため、record スキーマより先に判定する必要があります。
// record スキーマは配列にもマッチして数値キーのオブジェクトに変換してしまうため、配列形式を先に処理しないと mergeVariables での配列としてのマージが行われません。
const VariablesSourceSchema = v.union([
  v.array(v.tuple([VariablesKeySchema, v.unknown()])),
  v.record(v.any(), v.unknown()),
]);

const OpenOptionsSchema = v.object({
  /**
   * 処理の中断を通知するためのシグナルです。
   */
  signal: v.optional(v.instance(AbortSignal)),

  /**
   * 実行時の変数です。
   */
  vars: v.optional(VariablesSourceSchema),
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
  vars: v.optional(VariablesSourceSchema),
});

const CloseArgsSchema = v.tuple([v.optional(CloseOptionsSchema)]);

const SetOptionsSchema = v.object({
  key: v.string(),
  value: v.unknown(),
  signal: v.optional(v.instance(AbortSignal)),
  vars: v.optional(VariablesSourceSchema),
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
  vars: v.optional(VariablesSourceSchema),
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
  vars: v.optional(VariablesSourceSchema),
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
  vars: v.optional(VariablesSourceSchema),
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
  vars: v.optional(VariablesSourceSchema),
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
  vars: v.optional(VariablesSourceSchema),
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
  readonly vars?: VariablesSource | undefined;
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
  readonly vars?: VariablesSource | undefined;
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
  readonly vars?: VariablesSource | undefined;
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
  readonly vars?: VariablesSource | undefined;
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
  readonly vars?: VariablesSource | undefined;
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

        // valueStream が読み取られないまま GC されたとき、ソースストリームが保持するリソース (S3 レスポンスボディなど) を解放するために破棄します。
        // dispose は valueStream 自身を参照しないため、これを保持しても valueStream のガベージコレクションを妨げません。
        // 失敗しても対処できないので無視します。
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
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#config-builder)
 */
export type UniKvsDestination = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#config-builder)
   */
  readonly storage: UniKvsStorage;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#config-builder)
   */
  readonly transformers: readonly UniKvsTransformer[];
};

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
    return new UniKvsBranch() as unknown as IUniKvsBranch;
  }

  /**
   * 現在の接続状態です。非接続時は null となります。
   */
  #con: Connection | null;

  readonly #acSet: Set<AbortController>;

  /**
   * 基本となる実行変数情報です。
   */
  readonly #vars: Readonly<Variables>;

  /**
   * データの永続化先となるストレージと前段パイプラインのリストです。
   */
  readonly #destinations: readonly [UniKvsDestination, ...UniKvsDestination[]];

  /**
   * データの変換を行うトランスフォーマーのリストです。open/close の管理用に全件を保持します。
   */
  readonly #transformers: readonly UniKvsTransformer[];

  /**
   * キーに対応する値のスキーマ情報を解決するリゾルバーです。スキーマ未設定時は null となります。
   */
  readonly #valueSchemaResolver: IValueSchemaResolver | null;

  /**
   * 宛先ごとの書き戻し許可です。create 時に確定します。
   */
  readonly #repairFlags: readonly boolean[];

  /**
   * 共有 prefix の長さです。create 時に確定します。
   */
  readonly #prefixLength: number;

  /**
   * 共有 prefix のトランスフォーマーです。create 時に確定します。
   */
  readonly #prefixTransformers: readonly UniKvsTransformer[];

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#client-operations)
   */
  public constructor(
    vars: Readonly<Variables>,
    destinations: readonly [UniKvsDestination, ...UniKvsDestination[]],
    transformers: readonly UniKvsTransformer[],
    valueSchemaResolver: IValueSchemaResolver | null = null,
    repairFlags: readonly boolean[] = [],
    shared:
      | {
          readonly prefixLength: number;
          readonly prefixTransformers: readonly UniKvsTransformer[];
        }
      | undefined,
  ) {
    this.#con = null;
    this.#acSet = new Set();
    this.#vars = { ...vars };
    this.#destinations = destinations;
    this.#transformers = transformers;
    this.#valueSchemaResolver = valueSchemaResolver;
    this.#repairFlags = [...repairFlags];
    this.#prefixLength = shared?.prefixLength ?? 0;
    this.#prefixTransformers = shared?.prefixTransformers ?? [];
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
   * 指定した宛先の書き戻し許可を判定します。
   *
   * @param dest 判定する宛先です。
   * @returns 許可されている場合は `true` を返します。
   */
  #canRepair(dest: UniKvsDestination): boolean {
    const index = this.#destinations.indexOf(dest);
    return this.#repairFlags[index] === true;
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

    const vars = mergeVariables(this.#vars, varsOption);
    vars["unikvs:action"] = "open";

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

      // 各ストレージのオープン処理をリストに追加します。
      for (const [index, { storage }] of this.#destinations.entries()) {
        openFns.push([
          async () => {
            await storage.open(vars, signal);

            dispose.push(async () => {
              try {
                await storage.close(vars, signal);
              } catch (ex) {
                logger.error`Failed to close storage: ${ex}`;
              }
            });
          },
          "storage",
          storage.name,
          index,
        ]);
      }

      // 各トランスフォーマーのオープン処理をリストに追加します。
      for (const [index, transformer] of this.#transformers.entries()) {
        openFns.push([
          async () => {
            await transformer.open(vars, signal);

            dispose.push(async () => {
              try {
                await transformer.close(vars, signal);
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
        // 中断以外の失敗が混在しない場合は、abort 理由が集約エラーに埋もれないようにそのまま投げます。
        if (signal.aborted && errors.every((error) => error.reason === signal.reason)) {
          throw signal.reason;
        }

        throw new PluginOperationAggregateError({ action: "open", errors });
      }

      // すべてのプラグインのオープンが成功した後も、待機中に中断されていないか最終確認します。
      // 中断済みのシグナルを持つ接続を作成すると、isOpen が true でありながら以降のすべての操作が即座に失敗する壊れた状態になります。
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
        for (const [index, { storage }] of this.#destinations.entries()) {
          closeFns.push([
            async () => {
              await storage.close(vars, signal);
            },
            "storage",
            storage.name,
            index,
          ]);
        }

        // トランスフォーマーのクローズ処理を登録します。
        for (const [index, plugin] of this.#transformers.entries()) {
          closeFns.push([
            async () => {
              await plugin.close(vars, signal);
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

      const vars = mergeVariables(this.#vars, varsOption);
      vars["unikvs:action"] = "close";

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
        // #close が失敗した場合、コネクションの AbortController はすでに abort 済みであり、以降の操作がすべて即座に失敗する壊れた状態になります。
        // そこで接続を破棄して isOpen=false の一貫した状態にし、ベストエフォートでプラグインのクローズ処理を実行します。
        if (this.#con === con) {
          this.#con = null;

          const disposeSignal = AbortSignal.timeout(10e3);
          await Promise.all(
            [...this.#destinations.map((dest) => dest.storage), ...this.#transformers].map(
              async (plugin) => {
                try {
                  await plugin.close(vars, disposeSignal);
                } catch (ex) {
                  logger.error`Failed to close plugin after close failure: ${ex}`;
                }
              },
            ),
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
    const value = valueSchema ? parseSetValue(valueSchema, options.value) : options.value;

    const { ac, io } = this.#con;
    const signal = combineSignals([ac.signal, signalOption]);

    const vars = mergeVariables(this.#vars, varsOption);
    vars["unikvs:action"] = "set";
    vars["unikvs:key"] = key;

    const lock = await asyncmux.readonly(this, signal);
    try {
      // ロック待機中に接続状態が変更されていないか再確認します。
      if (this.#con === null) {
        throw new UniKvsIsNotOpenError();
      }

      const errors: { name: string; index: number; reason: unknown }[] = [];
      const errorStorageSet = new Set<UniKvsDestination>();
      if (isReadableStream(value)) {
        // 共有 prefix を先行して取得します。
        // P=0 時は生成も取得もしません。
        const prefixEncodables: TransformStream<any, any>[] = [];
        if (this.#prefixLength > 0) {
          const prefixVars = withStorageNamesForMany(
            vars,
            this.#destinations.map((dest) => dest.storage.name),
          );
          try {
            for (const transformer of this.#prefixTransformers) {
              signal.throwIfAborted();
              const e = await transformer.getEncodable(prefixVars, signal);
              prefixEncodables.push(e);
            }
          } catch (ex) {
            // 取得前に分岐を作らないためソースを直接解放します。
            try {
              await value.cancel(ex);
            } catch {}

            throw ex;
          }
        }

        // prefix 鎖を1本通します。
        // P=0 時は素通しになります。
        let sharedStream: ReadableStream = value;
        const prefixPipes: ReadableStream[] = [];
        for (const e of prefixEncodables) {
          sharedStream = sharedStream.pipeThrough(e);
          prefixPipes.push(sharedStream);
        }

        // suffix 用に分岐します。
        // 単一宛先時は tee しません。
        const count = this.#destinations.length;
        let raws: ReadableStream[];
        if (count === 1) {
          raws = [sharedStream];
        } else {
          raws = [];
          let cur: ReadableStream = sharedStream;
          for (let i = 0; i < count - 1; i++) {
            const [branch, rest] = cur.tee();
            raws.push(branch);
            cur = rest;
          }
          raws.push(cur);
        }

        const branches: ReadableStream[] = [...raws];
        // tee 分岐と中間段が保持するソースのリソースを解放するために全段を保持します。
        const built = new Set<ReadableStream>([value, ...prefixPipes, ...raws]);
        // 構築失敗時にパイプが保持するソースのリソースを解放するために構築済み分岐をキャンセルします。
        const cancelBranches = (reason: unknown): Promise<void> => cancelAllBranches(built, reason);
        try {
          for (let i = 0; i < count; i++) {
            const dest = this.#destinations[i]!;
            const destVars = withStorageNames(vars, dest.storage.name);
            let pipe: ReadableStream = raws[i]!;
            for (const transformer of dest.transformers.slice(this.#prefixLength)) {
              signal.throwIfAborted();
              const e = await transformer.getEncodable(destVars, signal);
              pipe = pipe.pipeThrough(e);
              branches[i] = pipe;
              built.add(pipe);
            }
          }
        } catch (ex) {
          await cancelBranches(ex);

          throw ex;
        }

        let lock: AsyncmuxLock;
        try {
          lock = await io.lock({ key, signal });
        } catch (ex) {
          // キーロックの待機中に中断された場合も、構築済みのストリームがソースストリームをロックしたままにしないようにキャンセルします。
          await cancelBranches(ex);

          throw ex;
        }

        try {
          await Promise.all(
            this.#destinations.map(async (dest, i) => {
              // tee ブランチはキャンセルされるまで健康なブランチの読み取り分のチャンクを保持し続けるため、失敗時に放棄したブランチを確実にキャンセルできるよう参照を保持します。
              // 駆動時の prefix 由来失敗も宛先別に集約します。
              const branch = branches[i]!;
              try {
                const destVars = withStorageNames(vars, dest.storage.name);
                const w = await dest.storage.getWritable(destVars, signal, key);
                await branch.pipeTo(w, { signal });
              } catch (ex) {
                try {
                  await branch.cancel(ex);
                } catch {
                  // キャンセルに失敗してもエラー集約を優先します。
                }

                errors.push({ name: dest.storage.name, index: i, reason: ex });
                errorStorageSet.add(dest);
              }
            }),
          );
        } finally {
          lock.release();
        }
      } else {
        // 共有 prefix を1回だけ実行します。
        // P=0 時は生成も実行もしません。
        let shared: unknown = value;
        if (this.#prefixLength > 0) {
          const prefixVars = withStorageNamesForMany(
            vars,
            this.#destinations.map((dest) => dest.storage.name),
          );
          for (const transformer of this.#prefixTransformers) {
            signal.throwIfAborted();
            shared = await transformer.encode(prefixVars, signal, shared);
          }
        }

        // 宛先固有の suffix を実行します。
        const encoded: unknown[] = [];
        for (const dest of this.#destinations) {
          const destVars = withStorageNames(vars, dest.storage.name);
          let data: unknown = shared;
          for (const transformer of dest.transformers.slice(this.#prefixLength)) {
            signal.throwIfAborted();
            data = await transformer.encode(destVars, signal, data);
          }
          encoded.push(data);
        }

        const lock = await io.lock({ key, signal });
        try {
          await Promise.all(
            this.#destinations.map(async (dest, i) => {
              try {
                const destVars = withStorageNames(vars, dest.storage.name);
                await dest.storage.write(destVars, signal, key, encoded[i]);
              } catch (ex) {
                errors.push({ name: dest.storage.name, index: i, reason: ex });
                errorStorageSet.add(dest);
              }
            }),
          );
        } finally {
          lock.release();
        }
      }

      // エラーが発生した場合は集約します。
      if (errors.length > 0) {
        const error = new PluginOperationAggregateError({
          plugin: "storage",
          action: "write",
          errors,
        });
        {
          const errors: unknown[] = [];
          await Promise.all(
            this.#destinations.map(async (dest) => {
              if (errorStorageSet.has(dest)) {
                return;
              }

              try {
                const destVars = withStorageNames(vars, dest.storage.name);
                await dest.storage.onOtherWriteError(destVars, signal, key, error);
              } catch (ex) {
                errors.push(ex);
              }
            }),
          );
          if (errors.length > 0) {
            logger.error(new AggregateError(errors, "Failed to handle error"));
          }
        }

        throw error;
      }
    } finally {
      lock.release();
    }
  }

  // 読み取り元を全デコードして原データに戻します。
  // 共有 prefix と宛先固有 suffix で再エンコードして書き戻します。
  async #decodeWithRepair(
    data: unknown,
    transformers: readonly UniKvsTransformer[],
    sourceName: string,
    targets: readonly UniKvsDestination[],
    vars: Variables,
    key: IStorage.Key,
    signal: AbortSignal,
    throwOnRepairDenied: boolean,
  ): Promise<unknown> {
    // 書き戻しによる書き込みであることが分かるように、書き込み専用の変数を用意します。
    const repairVars: Variables = { ...vars, "unikvs:repair": true };
    const decodeVars: Variables = withStorageNames(vars, sourceName);
    let raw: unknown = data;
    for (const transformer of transformers.toReversed()) {
      raw = await transformer.decode(decodeVars, signal, raw);
      signal.throwIfAborted();
    }

    // 共有 prefix を書き戻し対象名簿で1回だけ実行します。
    // P=0 時や対象なし時は実行しません。
    let repairShared: unknown = raw;
    if (targets.length > 0 && this.#prefixLength > 0) {
      const repairPrefixVars = withStorageNamesForMany(
        repairVars,
        targets.map((dest) => dest.storage.name),
      );
      try {
        for (const transformer of this.#prefixTransformers) {
          signal.throwIfAborted();
          repairShared = await transformer.encode(repairPrefixVars, signal, repairShared);
        }
      } catch (ex) {
        // 意図的な中断時は中断理由で失敗します。
        if (signal.aborted) {
          throw ex;
        }
        if (ex instanceof RepairNotAllowedError) {
          repairLogger.warn`Failed to repair a storage: ${ex}`;

          if (throwOnRepairDenied) {
            throw new RepairNotAllowedError({
              names: targets.map((dest) => dest.storage.name),
              cause: ex,
            });
          }

          return raw;
        }

        logger.error`Failed to repair a storage: ${ex}`;

        return raw;
      }
    }

    await Promise.all(
      targets.map(async (dest) => {
        if (!this.#canRepair(dest)) {
          // 意図的な中断時はエラーではありません。
          if (signal.aborted) {
            return;
          }

          repairLogger.warn`Skipped repair for a storage without AllowRepair: ${dest.storage.name}`;

          if (throwOnRepairDenied) {
            throw new RepairNotAllowedError({ names: [dest.storage.name] });
          }

          return;
        }

        try {
          const destRepairVars: Variables = withStorageNames(repairVars, dest.storage.name);
          let repairEncoded: unknown = repairShared;
          for (const transformer of dest.transformers.slice(this.#prefixLength)) {
            signal.throwIfAborted();
            repairEncoded = await transformer.encode(destRepairVars, signal, repairEncoded);
          }

          await dest.storage.write(destRepairVars, signal, key, repairEncoded);
        } catch (ex) {
          // 意図的な中断時はエラーではありません。
          if (signal.aborted) {
            return;
          }
          if (ex instanceof RepairNotAllowedError) {
            repairLogger.warn`Failed to repair a storage: ${ex}`;

            if (throwOnRepairDenied) {
              throw new RepairNotAllowedError({
                names: [dest.storage.name],
                cause: ex,
              });
            }

            return;
          }

          logger.error`Failed to repair a storage: ${ex}`;
        }
      }),
    );

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

    const vars = mergeVariables(this.#vars, varsOption);
    vars["unikvs:action"] = "get";
    vars["unikvs:key"] = key;

    const lock = await asyncmux.readonly(this, signal);
    try {
      // ロック待機中に接続状態が変更されていないか再確認します。
      if (this.#con === null) {
        throw new UniKvsIsNotOpenError();
      }

      const NONE = {};
      let data: any = NONE;
      let transformers: readonly UniKvsTransformer[] = [];
      let sourceName = "";
      const missing: UniKvsDestination[] = [];
      const errors: { name: string; index: number; reason: unknown }[] = [];

      // 書き戻し時は、読み取りから書き込みまでを同じキーの書き込みと直列化するために書き込みロックを取得します。
      const lock = await (repair ? io.lock({ key, signal }) : io.rLock({ key, signal }));
      try {
        // 各ストレージを巡回し、最初に見つかったデータを取得します。
        // あるストレージの読み取りに失敗しても、他のストレージからデータを取得できるようにフォールバックします。
        for (const [index, dest] of this.#destinations.entries()) {
          const destVars = withStorageNames(vars, dest.storage.name);
          try {
            if (!(await dest.storage.exists(destVars, signal, key))) {
              missing.push(dest);
              continue;
            }
            data = await dest.storage.read(destVars, signal, key);
            transformers = dest.transformers;
            sourceName = dest.storage.name;
            break;
          } catch (ex) {
            if (signal.aborted) {
              throw ex;
            }
            errors.push({ name: dest.storage.name, index, reason: ex });
            logger.error`Failed to read from a storage: ${ex}`;
          }
        }

        if (data === NONE) {
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

          throw new KeyNotFoundError(args);
        }

        if (repair) {
          // 後段ヒットしたデータを全デコードして原データに戻します。
          // 共有 prefix と宛先固有 suffix で再エンコードして書き戻します。
          data = await this.#decodeWithRepair(
            data,
            transformers,
            sourceName,
            missing,
            vars,
            key,
            signal,
            throwOnRepairDenied,
          );
        }
      } finally {
        lock.release();
      }

      if (!repair) {
        // 見つかったストレージ専用の前段パイプラインを逆順に適用してデータをデコードします。
        const decodeVars = withStorageNames(vars, sourceName);
        for (const transformer of transformers.toReversed()) {
          data = await transformer.decode(decodeVars, signal, data);
        }
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

    const vars = mergeVariables(this.#vars, varsOption);
    vars["unikvs:action"] = "stream";
    vars["unikvs:key"] = key;

    const lock = await asyncmux.readonly(this, signal);
    try {
      // ロック待機中に接続状態が変更されていないか再確認します。
      if (this.#con === null) {
        throw new UniKvsIsNotOpenError();
      }

      const NONE: any = {};
      let r: IReadableStream = NONE;
      let transformers: readonly UniKvsTransformer[] = [];
      let sourceName = "";
      const missing: UniKvsDestination[] = [];
      const errors: { name: string; index: number; reason: unknown }[] = [];
      const fillBranches: IReadableStream[] = [];
      const fillTasks: Promise<void>[] = [];
      let repairAc: AbortController | null = null;
      let cancelFills: ((reason: unknown) => Promise<void>) | null = null;

      // 書き戻し時は、読み取りから書き込みまでを同じキーの書き込みと直列化するために書き込みロックを取得します。
      const lock = await (repair ? io.lock({ key, signal }) : io.rLock({ key, signal }));
      try {
        // 各ストレージを巡回し、最初に見つかったデータを取得します。
        // あるストレージの読み取りに失敗しても、他のストレージからデータを取得できるようにフォールバックします。
        for (const [index, dest] of this.#destinations.entries()) {
          const destVars = withStorageNames(vars, dest.storage.name);
          try {
            if (!(await dest.storage.exists(destVars, signal, key))) {
              missing.push(dest);
              continue;
            }

            r = await dest.storage.getReadable(destVars, signal, key);
            transformers = dest.transformers;
            sourceName = dest.storage.name;
            break;
          } catch (ex) {
            if (signal.aborted) {
              throw ex;
            }

            errors.push({ name: dest.storage.name, index, reason: ex });
            logger.error`Failed to read from a storage: ${ex}`;
          }
        }

        if (r === NONE) {
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

          throw new KeyNotFoundError(args);
        }

        // 書き戻しが有効な場合のみ、ストリームが途中で破棄されたときに進行中の書き戻しも中断できるようにします。
        repairAc = repair ? new AbortController() : null;
        const repairSignal = repairAc ? combineSignals([signal, repairAc.signal]) : signal;

        // 書き戻しによる書き込みであることが分かるように、書き込み専用の変数を用意します。
        const repairVars: Variables = repair ? { ...vars, "unikvs:repair": true } : vars;

        // 書き戻し先へ分岐をパイプします。書き戻しはベストエフォートであり、失敗はログに残して続行します。
        const fill = (
          dest: UniKvsDestination,
          branch: IReadableStream,
          destRepairVars: Variables,
        ): void => {
          fillBranches.push(branch);
          fillTasks.push(
            (async () => {
              try {
                const w = await dest.storage.getWritable(destRepairVars, repairSignal, key);
                await branch.pipeTo(w, { signal: repairSignal });
              } catch (ex) {
                // パイプが中断された場合は分岐を解放し、tee が後続のチャンクを保持し続けないようにします。
                try {
                  await branch.cancel(ex);
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

        // セットアップの失敗時に、構築済みの分岐と進行中の書き戻しを中断します。
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

        // 読み取り元を全デコードして原データに戻します。
        // 修復分岐は読取パスと分離します。
        const decodeVars = withStorageNames(vars, sourceName);
        for (const transformer of transformers.toReversed()) {
          const d = await transformer.getDecodable(decodeVars, signal);
          r = r.pipeThrough(d);
        }
        if (repair) {
          // 第一層で除外される宛先を除き修復対象を確定します。
          const repairTargets: UniKvsDestination[] = [];
          for (const dest of missing) {
            if (!this.#canRepair(dest)) {
              // 意図的な中断時はエラーではありません。
              if (signal.aborted) {
                continue;
              }

              repairLogger.warn`Skipped repair for a storage without AllowRepair: ${dest.storage.name}`;

              if (throwOnRepairDenied) {
                throw new RepairNotAllowedError({ names: [dest.storage.name] });
              }

              continue;
            }

            repairTargets.push(dest);
          }
          if (repairTargets.length > 0) {
            // 共有 prefix を tee 前に先行して取得します。
            // P=0 時は生成も取得もしません。
            const prefixEncodables: TransformStream<any, any>[] = [];
            let prefixSkipped = false;
            if (this.#prefixLength > 0) {
              const repairPrefixVars = withStorageNamesForMany(
                repairVars,
                repairTargets.map((dest) => dest.storage.name),
              );
              try {
                for (const transformer of this.#prefixTransformers) {
                  signal.throwIfAborted();
                  const e = await transformer.getEncodable(repairPrefixVars, signal);
                  prefixEncodables.push(e);
                }
              } catch (ex) {
                // 意図的な中断時は中断理由で失敗します。
                if (signal.aborted) {
                  signal.throwIfAborted();
                }
                if (ex instanceof RepairNotAllowedError) {
                  repairLogger.warn`Failed to repair a storage: ${ex}`;

                  if (throwOnRepairDenied) {
                    throw new RepairNotAllowedError({
                      names: repairTargets.map((dest) => dest.storage.name),
                      cause: ex,
                    });
                  }

                  prefixSkipped = true;
                } else {
                  logger.error`Failed to repair a storage: ${ex}`;

                  throw ex;
                }
              }
            }
            // 宛先固有の suffix を tee 前に取得します。
            // 失敗時は分岐の後始末が不要になります。
            const activeTargets: UniKvsDestination[] = [];
            const activeVars: Variables[] = [];
            const activeEncodables: TransformStream<any, any>[][] = [];
            if (!prefixSkipped) {
              for (const dest of repairTargets) {
                const destRepairVars: Variables = withStorageNames(repairVars, dest.storage.name);
                const encodables: TransformStream<any, any>[] = [];
                try {
                  for (const transformer of dest.transformers.slice(this.#prefixLength)) {
                    signal.throwIfAborted();
                    const e = await transformer.getEncodable(destRepairVars, signal);
                    encodables.push(e);
                  }
                } catch (ex) {
                  // 意図的な中断時は中断理由で失敗します。
                  if (signal.aborted) {
                    signal.throwIfAborted();
                  }
                  if (ex instanceof RepairNotAllowedError) {
                    repairLogger.warn`Failed to repair a storage: ${ex}`;

                    if (throwOnRepairDenied) {
                      throw new RepairNotAllowedError({
                        names: [dest.storage.name],
                        cause: ex,
                      });
                    }

                    continue;
                  }

                  logger.error`Failed to repair a storage: ${ex}`;

                  throw ex;
                }

                activeTargets.push(dest);
                activeVars.push(destRepairVars);
                activeEncodables.push(encodables);
              }
            }
            if (activeTargets.length > 0) {
              // 読取パスを不変に保つため修復用に1本分岐します。
              const [repairBranch, readRest] = r.tee();
              r = readRest;
              // 分岐に prefix 鎖を通して修復起点を得ます。
              // P=0 時は分岐がそのまま起点になります。
              let repairRoot: IReadableStream = repairBranch;
              for (const e of prefixEncodables) {
                repairRoot = repairRoot.pipeThrough(e);
              }
              // 起点を対象数で分岐します。
              // 単一対象時は tee しません。
              let repairPipes: IReadableStream[];
              if (activeTargets.length === 1) {
                repairPipes = [repairRoot];
              } else {
                repairPipes = [];
                let cur: IReadableStream = repairRoot;
                for (let i = 0; i < activeTargets.length - 1; i++) {
                  const [branch, rest] = cur.tee();
                  repairPipes.push(branch);
                  cur = rest;
                }
                repairPipes.push(cur);
              }
              // suffix 鎖を通して fill します。
              // fill 時の失敗はベストエフォートで握りつぶします。
              for (let i = 0; i < activeTargets.length; i++) {
                let pipe: IReadableStream = repairPipes[i]!;
                for (const e of activeEncodables[i]!) {
                  pipe = pipe.pipeThrough(e);
                }

                fill(activeTargets[i]!, pipe, activeVars[i]!);
              }
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

        // ストリームを読み切ったかどうかを監視します。読み切った場合は書き戻しの完了を待ち、途中で破棄された場合は書き戻しを中断します。
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
        // tee で分岐したストリームは、分岐のキャンセルが揃うまで元ストリームのキャンセルが完了しないためです。
        const beforeDispose = (): void => {
          if (!completed) {
            repairAc?.abort(signal.reason);
          }
        };

        // 書き戻しの完了または中断を待ってからキーの書き込みロックを解放します。
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

        // valueStream が GC されるタイミングでストリームが終了していなければロックを自動解放するとともに、ソースストリームが保持するリソース (S3 レスポンスボディなど) を解放できるように dispose を記録します。
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
          // getReadable 成功後のセットアップ中に失敗した場合、ソースストリームが保持するリソース (S3 レスポンスボディなど) を解放するためにキャンセルします。
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

    const vars = mergeVariables(this.#vars, varsOption);
    vars["unikvs:action"] = "has";
    vars["unikvs:key"] = key;

    const lock = await asyncmux.readonly(this, signal);
    try {
      // ロック待機中に接続状態が変更されていないか再確認します。
      if (this.#con === null) {
        throw new UniKvsIsNotOpenError();
      }

      const lock = await io.rLock({ key, signal });
      try {
        // いずれかのストレージに存在すれば true を返します。
        // あるストレージの存在確認に失敗しても、他のストレージで存在を確認できるようにフォールバックします。
        const errors: { name: string; index: number; reason: unknown }[] = [];
        for (const [index, { storage }] of this.#destinations.entries()) {
          const destVars = withStorageNames(vars, storage.name);
          try {
            if (await storage.exists(destVars, signal, key)) {
              return true;
            }
          } catch (ex) {
            if (signal.aborted) {
              throw ex;
            }
            errors.push({ name: storage.name, index, reason: ex });
            logger.error`Failed to check existence in a storage: ${ex}`;
          }
        }

        // すべてのストレージで存在を確認できなかった場合は結果が不明のため、get() と同様にエラーとして報告します。
        if (errors.length > 0) {
          const args: KeyNotFoundErrorArgs = { key };
          switch (errors.length) {
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

          throw new KeyNotFoundError(args);
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

    const vars = mergeVariables(this.#vars, varsOption);
    vars["unikvs:action"] = "delete";
    vars["unikvs:key"] = key;

    const lock = await asyncmux.readonly(this, signal);
    try {
      // ロック待機中に接続状態が変更されていないか再確認します。
      if (this.#con === null) {
        throw new UniKvsIsNotOpenError();
      }

      const lock = await io.lock({ key, signal });
      try {
        // すべてのストレージから対象データを削除します。
        // すべての処理を並列に実行し、エラーが発生した場合は集約します。
        const errors: { name: string; index: number; reason: unknown }[] = [];
        await Promise.all(
          this.#destinations.map(async ({ storage }, index) => {
            const destVars = withStorageNames(vars, storage.name);
            try {
              if (await storage.exists(destVars, signal, key)) {
                await storage.delete(destVars, signal, key);
              }
            } catch (ex) {
              errors.push({ name: storage.name, index, reason: ex });
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

    const vars = mergeVariables(this.#vars, varsOption);
    vars["unikvs:action"] = "clear";

    const lock = await asyncmux.readonly(this, signal);
    try {
      // ロック待機中に接続状態が変更されていないか再確認します。
      if (this.#con === null) {
        throw new UniKvsIsNotOpenError();
      }

      const lock = await io.lock({ signal });
      try {
        // すべてのストレージで一括削除を実行します。
        // すべての処理を並列に実行し、エラーが発生した場合は集約します。
        const errors: { name: string; index: number; reason: unknown }[] = [];
        await Promise.all(
          this.#destinations.map(async ({ storage }, index) => {
            const destVars = withStorageNames(vars, storage.name);
            try {
              await storage.clear(destVars, signal);
            } catch (ex) {
              errors.push({ name: storage.name, index, reason: ex });
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
