import type { Context, IStorage, IReadableStream } from "@unikvs/core";
import { combineSignals } from "abort-signal-utils";
import { type AsyncmuxLock, asyncmux, Asyncmux } from "asyncmux";

import logger from "./_logger.js";
import mergeContext from "./_merge-context.js";
import UniKvsStorage from "./_storage.js";
import toValueStream from "./_to-value-stream.js";
import UniKvsTransformer from "./_transformer.js";
import * as v from "./_valibot.js";
import type { ContextSource } from "./context.types.js";
import {
  KeyNotFoundError,
  UniKvsIsOpenError,
  PluginOperationAggregateError,
  UniKvsIsNotOpenError,
} from "./errors.js";
import UniKvsConfig, {
  type Value,
  type PlainValue,
  type StreamValue,
  type KeyValueMapping,
  type $InferPlainValueData,
  type IUniKvsConfigBuilder,
  type KeyofKeyValueMapping,
  type $InferStreamValueChunkData,
} from "./unikvs-config.js";
import type { ValueOf } from "./utils.types.js";
import type { ValueStream } from "./value-stream.types.js";

// -------------------------------------------------------------------------------------------------
//
// ユーティリテー
//
// -------------------------------------------------------------------------------------------------

/**
 * 設定可能な値の型定義です。
 *
 * @template TValue 値の型定義です。
 */
export type SetValue<TValue extends Value> =
  | $InferPlainValueData<TValue>
  | (TValue extends StreamValue<infer TChunkData> ? ReadableStream<TChunkData> : never);

/**
 * プレーンな値を持つキーのみを抽出する型定義です。
 *
 * @template TKeyValueMapping キーと値のマッピング定義です。
 */
export type KeyofKeyValueMappingHasPlainValue<TKeyValueMapping extends KeyValueMapping> = ValueOf<{
  [TKey in KeyofKeyValueMapping<TKeyValueMapping>]: PlainValue extends TKeyValueMapping[TKey]
    ? TKey
    : never;
}>;

/**
 * ストリーム形式の値を持つキーのみを抽出する型定義です。
 *
 * @template TKeyValueMapping キーと値のマッピング定義です。
 */
export type KeyofKeyValueMappingHasStreamValue<TKeyValueMapping extends KeyValueMapping> = ValueOf<{
  [TKey in KeyofKeyValueMapping<TKeyValueMapping>]: StreamValue extends TKeyValueMapping[TKey]
    ? TKey
    : never;
}>;

// -------------------------------------------------------------------------------------------------
//
// スキーマ
//
// -------------------------------------------------------------------------------------------------

const ContextKeySchema = v.string();

const ContextSourceSchema = v.union([
  v.record(v.any(), v.unknown()),
  v.array(v.tuple([ContextKeySchema, v.unknown()])),
]);

const OpenOptionsSchema = v.object({
  /**
   * 処理の中断を通知するためのシグナルです。
   */
  signal: v.optional(v.instance(AbortSignal)),

  /**
   * 実行時のコンテキスト情報です。
   */
  context: v.optional(ContextSourceSchema),
});

const OpenArgsSchema = v.tuple([v.optional(OpenOptionsSchema)]);

const CloseOptionsSchema = v.object({
  /**
   * 処理の中断を通知するためのシグナルです。
   */
  signal: v.optional(v.instance(AbortSignal)),

  /**
   * 実行時のコンテキスト情報です。
   */
  context: v.optional(ContextSourceSchema),
});

const CloseArgsSchema = v.tuple([v.optional(CloseOptionsSchema)]);

const SetOptionsSchema = v.object({
  key: v.string(),
  value: v.unknown(),
  signal: v.optional(v.instance(AbortSignal)),
  context: v.optional(ContextSourceSchema),
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
  signal: v.optional(v.instance(AbortSignal)),
  context: v.optional(ContextSourceSchema),
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
  signal: v.optional(v.instance(AbortSignal)),
  context: v.optional(ContextSourceSchema),
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
  context: v.optional(ContextSourceSchema),
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
  context: v.optional(ContextSourceSchema),
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
   * 実行時のコンテキスト情報です。
   */
  context: v.optional(ContextSourceSchema),
});

const ClearArgsSchema = v.tuple([v.optional(ClearOptionsSchema)]);

// -------------------------------------------------------------------------------------------------
//
// 型定義
//
// -------------------------------------------------------------------------------------------------

/**
 * オープン操作時のオプションです。
 */
export type OpenOptions = v.InferInput<typeof OpenOptionsSchema>;

/**
 * クローズ操作時のオプションです。
 */
export type CloseOptions = v.InferInput<typeof CloseOptionsSchema>;

/**
 * 保存操作時のオプションです。
 *
 * @template TKeyValueMapping キーと値のマッピング定義です。
 * @template TKey 対象となるキーの型です。
 */
export type SetOptions<
  TKeyValueMapping extends KeyValueMapping = KeyValueMapping,
  TKey extends KeyofKeyValueMapping<TKeyValueMapping> = KeyofKeyValueMapping<TKeyValueMapping>,
> = {
  /**
   * 操作対象を識別するためのキーです。
   */
  readonly key: TKey;

  /**
   * 保存する値です。
   */
  readonly value: SetValue<TKeyValueMapping[TKey]>;

  /**
   * 処理の中断を通知するためのシグナルです。
   */
  readonly signal?: AbortSignal | undefined;

  /**
   * 実行時のコンテキスト情報です。
   */
  readonly context?: ContextSource | undefined;
};

/**
 * 取得操作時のオプションです。
 *
 * @template TKey 対象となるキーの型です。
 */
export type GetOptions<TKey = IStorage.Key> = {
  /**
   * 操作対象を識別するためのキーです。
   */
  readonly key: TKey;

  /**
   * 処理の中断を通知するためのシグナルです。
   */
  readonly signal?: AbortSignal | undefined;

  /**
   * 実行時のコンテキスト情報です。
   */
  readonly context?: ContextSource | undefined;
};

/**
 * ストリーム取得操作時のオプションです。
 *
 * @template TKey 対象となるキーの型です。
 */
export type StreamOptions<TKey = IStorage.Key> = {
  /**
   * 操作対象を識別するためのキーです。
   */
  readonly key: TKey;

  /**
   * 処理の中断を通知するためのシグナルです。
   */
  readonly signal?: AbortSignal | undefined;

  /**
   * 実行時のコンテキスト情報です。
   */
  readonly context?: ContextSource | undefined;
};

/**
 * 存在確認操作時のオプションです。
 *
 * @template TKey 対象となるキーの型です。
 */
export type HasOptions<TKey = IStorage.Key> = {
  /**
   * 操作対象を識別するためのキーです。
   */
  readonly key: TKey;

  /**
   * 処理の中断を通知するためのシグナルです。
   */
  readonly signal?: AbortSignal | undefined;

  /**
   * 実行時のコンテキスト情報です。
   */
  readonly context?: ContextSource | undefined;
};

/**
 * 削除操作時のオプションです。
 *
 * @template TKey 対象となるキーの型です。
 */
export type DeleteOptions<TKey = IStorage.Key> = {
  /**
   * 操作対象を識別するためのキーです。
   */
  readonly key: TKey;

  /**
   * 処理の中断を通知するためのシグナルです。
   */
  readonly signal?: AbortSignal | undefined;

  /**
   * 実行時のコンテキスト情報です。
   */
  readonly context?: ContextSource | undefined;
};

/**
 * 全削除操作時のオプションです。
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
    : new FinalizationRegistry<AsyncmuxLock>((lock) => {
        if (!lock.released) {
          lock.release();
        }
      });

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
 * UniKvs メインクラスです。
 *
 * 複数のストレージとトランスフォーマーを統合して KVS 操作を提供します。
 *
 * @template TKeyValueMapping キーと値のマッピング定義です。
 */
export default class UniKvs<TKeyValueMapping extends KeyValueMapping = KeyValueMapping> {
  /**
   * UniKvs の設定ビルダーを作成します。
   *
   * @template TKeyValueMapping マッピング定義です。
   * @returns 設定ビルダーのインスタンスです。
   * @example
   * ```typescript
   * import { Compression } from "@unikvs/compression";
   * import { FileSystem } from "@unikvs/fs.node";
   * import { UniKvs, type Value } from "unikvs";
   *
   * const kvs = UniKvs.config<{
   *   foo: Value<Uint8Array<ArrayBuffer>>;
   * }>()
   *   .appendTransformer(new Compression("gzip"))
   *   .appendStorage(new FileSystem(".tmp"))
   *   .create();
   *
   * await kvs.open();
   *
   * await kvs.set("foo", Uint8Array.from([0, 1, 2]));
   *
   * await kvs.close();
   * ```
   */
  public static config<
    TKeyValueMapping extends KeyValueMapping,
  >(): IUniKvsConfigBuilder<TKeyValueMapping> {
    return new UniKvsConfig(this);
  }

  /**
   * 現在の接続状態です。非接続時は null となります。
   */
  #con: Connection | null;

  readonly #acSet: Set<AbortController>;

  /**
   * 基本となる実行コンテキスト情報です。
   */
  readonly #context: Readonly<Context>;

  /**
   * データの永続化先となるストレージのリストです。
   */
  readonly #destinations: readonly [UniKvsStorage, ...UniKvsStorage[]];

  /**
   * データの変換を行うトランスフォーマーのリストです。
   */
  readonly #transformers: readonly UniKvsTransformer[];

  /**
   * インスタンスを初期化します。
   *
   * @internal UniKvs の設定ビルダー経由で使用します。
   * @param context コンテキストです。
   * @param destinations ストレージのリストです。
   * @param transformers トランスフォーマーのリストです。
   */
  public constructor(
    context: Readonly<Context>,
    destinations: readonly [UniKvsStorage, ...UniKvsStorage[]],
    transformers: readonly UniKvsTransformer[],
  ) {
    this.#con = null;
    this.#acSet = new Set();
    this.#context = { ...context };
    this.#destinations = destinations;
    this.#transformers = transformers;
  }

  /**
   * UniKvs が利用可能であるかを確認します。
   *
   * @returns 利用可能である場合は true、そうでない場合は false を返します。
   */
  public get isOpen(): boolean {
    return this.#con !== null;
  }

  /**
   * すべてのストレージとトランスフォーマーを初期化します。
   *
   * @param options オープン時のオプションです。
   * @returns 完了を通知する Promise です。
   */
  public open(options?: OpenOptions): Promise<void>;

  public async open(...args: any): Promise<void> {
    if (this.#con !== null) {
      throw new UniKvsIsOpenError();
    }

    const [options = {}] = v.parseInput(OpenArgsSchema, args);
    const { signal: signalOption, context: contextOption } = options;

    const ac = new AbortController();
    const signal = combineSignals([ac.signal, signalOption]);

    const context = mergeContext(this.#context, contextOption);
    context["unikvs:action"] = "open";

    signal.throwIfAborted();

    this.#acSet.add(ac);

    const dispose: (() => Promise<void>)[] = [];

    const lock = await asyncmux(this, signal);
    try {
      if (this.#con !== null) {
        throw new UniKvsIsOpenError();
      }

      const openFns: [() => Promise<void>, plugin: "storage" | "transformer"][] = [];

      // 各ストレージのオープン処理をリストに追加します。
      for (const storage of this.#destinations) {
        openFns.push([
          async () => {
            await storage.open(context, signal);

            dispose.push(async () => {
              try {
                await storage.close(context, signal);
              } catch (ex) {
                logger.error`Failed to close storage: ${ex}`;
              }
            });
          },
          "storage",
        ]);
      }

      // 各トランスフォーマーのオープン処理をリストに追加します。
      for (const transformer of this.#transformers) {
        openFns.push([
          async () => {
            await transformer.open(context, signal);

            dispose.push(async () => {
              try {
                await transformer.close(context, signal);
              } catch (ex) {
                logger.error`Failed to close transformer: ${ex}`;
              }
            });
          },
          "transformer",
        ]);
      }

      // すべての処理を並列に実行し、エラーが発生した場合は集約します。
      const errors: { plugin: "storage" | "transformer"; reason: unknown }[] = [];
      await Promise.all(
        openFns.map(async ([f, plugin]) => {
          try {
            await f();
          } catch (reason) {
            errors.push({ plugin, reason });
          }
        }),
      );
      if (errors.length > 0) {
        throw new PluginOperationAggregateError({ action: "open", errors });
      }

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
      lock.release();
    }
  }

  async #close(context: Context, signal: AbortSignal, con: Connection): Promise<void> {
    const lock = await asyncmux(this, signal);
    try {
      // ロック待機中に接続状態が変更されていないか再確認します。
      if (this.#con !== con) {
        throw new UniKvsIsNotOpenError();
      }

      const { io } = this.#con;
      const lock = await io.lock({ signal });
      try {
        const closeFns: [() => Promise<void>, plugin: "storage" | "transformer"][] = [];

        // ストレージのクローズ処理を登録します。
        for (const plugin of this.#destinations) {
          closeFns.push([
            async () => {
              await plugin.close(context, signal);
            },
            "storage",
          ]);
        }

        // トランスフォーマーのクローズ処理を登録します。
        for (const plugin of this.#transformers) {
          closeFns.push([
            async () => {
              await plugin.close(context, signal);
            },
            "transformer",
          ]);
        }

        // すべての処理を並列に実行し、エラーが発生した場合は集約します。
        const errors: { plugin: "storage" | "transformer"; reason: unknown }[] = [];
        await Promise.all(
          closeFns.map(async ([f, plugin]) => {
            try {
              await f();
            } catch (reason) {
              errors.push({ plugin, reason });
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
   * ストレージをクローズします。
   *
   * @param options クローズ時のオプションです。
   * @returns 完了を通知する Promise です。
   */
  public close(options?: CloseOptions): Promise<void>;

  public close(...args: any): Promise<void> {
    try {
      const [options = {}] = v.parseInput(CloseArgsSchema, args);
      const { signal = AbortSignal.timeout(10e3), context: contextOption } = options;

      const context = mergeContext(this.#context, contextOption);
      context["unikvs:action"] = "close";

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

      return this.#close(context, signal, con).catch(async (ex) => {
        // #close が失敗した場合、コネクションの AbortController は既に abort 済みであり
        // 以降の操作がすべて即座に失敗する壊れた状態になります。
        // そこで接続を破棄して isOpen=false の一貫した状態にし、
        // ベストエフォートでプラグインのクローズ処理を実行します。
        if (this.#con === con) {
          this.#con = null;

          const disposeSignal = AbortSignal.timeout(10e3);
          await Promise.all(
            [...this.#destinations, ...this.#transformers].map(async (plugin) => {
              try {
                await plugin.close(context, disposeSignal);
              } catch (reason) {
                logger.error`Failed to close plugin after close failure: ${reason}`;
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
   * UniKvs が開いている場合にクローズします。
   *
   * `await using` 構文による自動クローズに使用されます。
   *
   * @returns 完了を通知する Promise です。
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
   * 指定したオプションで値を保存します。
   *
   * @template TKey 対象キーの型定義です。
   * @param options セット操作のオプション一式です。
   * @returns 完了を通知する Promise です。
   */
  public set<const TKey extends KeyofKeyValueMapping<TKeyValueMapping>>(
    options: SetOptions<TKeyValueMapping, TKey>,
  ): Promise<void>;

  /**
   * 指定したキーに値を保存します。
   *
   * @template TKey 対象キーの型定義です。
   * @param key 操作対象を識別するためのキーです。
   * @param value 保存する値です。
   * @param options 追加のオプションです。
   * @returns 完了を通知する Promise です。
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
    const { key, value, signal: signalOption, context: contextOption } = options;

    const { ac, io } = this.#con;
    const signal = combineSignals([ac.signal, signalOption]);

    const context = mergeContext(this.#context, contextOption);
    context["unikvs:action"] = "set";
    context["unikvs:key"] = key;

    const lock = await asyncmux(this, signal);
    try {
      // ロック待機中に接続状態が変更されていないか再確認します。
      if (this.#con === null) {
        throw new UniKvsIsNotOpenError();
      }

      const errors: { reason: unknown }[] = [];
      const errorStorageSet = new Set<UniKvsStorage>();
      if (value instanceof ReadableStream) {
        // 各トランスフォーマーを通してデータをエンコードストリームへ変換します。
        let data = value;
        for (const transformer of this.#transformers) {
          const e = await transformer.getEncodable(context, signal);
          data = data.pipeThrough(e);
        }

        const lock = await io.lock({ key, signal });
        try {
          await Promise.all(
            this.#destinations.map(async (storage, i) => {
              try {
                // 複数のストレージがある場合は、tee メソッドを使用してストリームを分岐させます。
                let r = data;
                if (i !== this.#destinations.length - 1) {
                  [r, data] = data.tee();
                }

                const w = await storage.getWritable(context, signal, key);
                await r.pipeTo(w, { signal });
              } catch (reason) {
                errors.push({ reason });
                errorStorageSet.add(storage);
              }
            }),
          );
        } finally {
          lock.release();
        }
      } else {
        // 登録されているトランスフォーマーを順番に適用してデータをエンコードします。
        let data = value;
        for (const transformer of this.#transformers) {
          data = await transformer.encode(context, signal, data);
        }

        const lock = await io.lock({ key, signal });
        try {
          await Promise.all(
            this.#destinations.map(async (storage) => {
              try {
                await storage.write(context, signal, key, data);
              } catch (reason) {
                errors.push({ reason });
                errorStorageSet.add(storage);
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
            this.#destinations.map(async (storage) => {
              if (errorStorageSet.has(storage)) {
                return;
              }

              try {
                await storage.onOtherWriteError(context, signal, key, error);
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

  /**
   * 指定したオプションで値を取得します。
   *
   * @template TKey 対象キーの型定義です。
   * @param options 取得操作のオプション一式です。
   * @returns 取得した値を返します。
   */
  public get<const TKey extends KeyofKeyValueMappingHasPlainValue<TKeyValueMapping>>(
    options: GetOptions<TKey>,
  ): Promise<$InferPlainValueData<TKeyValueMapping[TKey]>>;

  /**
   * 指定したキーから値を取得します。
   *
   * @template TKey 対象キーの型定義です。
   * @param key 操作対象を識別するためのキーです。
   * @param options 追加のオプションです。
   * @returns 取得した値を返します。
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
    const { key, signal: signalOption, context: contextOption } = options;

    const { ac, io } = this.#con;
    const signal = combineSignals([ac.signal, signalOption]);

    const context = mergeContext(this.#context, contextOption);
    context["unikvs:action"] = "get";
    context["unikvs:key"] = key;

    const lock = await asyncmux.readonly(this, signal);
    try {
      // ロック待機中に接続状態が変更されていないか再確認します。
      if (this.#con === null) {
        throw new UniKvsIsNotOpenError();
      }

      const NONE = {};
      let data: any = NONE;
      const errors: { reason: unknown }[] = [];

      const lock = await io.rLock({ key, signal });
      try {
        // 各ストレージを巡回し、最初に見つかったデータを取得します。
        // あるストレージの読み取りに失敗しても、他のストレージから
        // データを取得できるようにフォールバックします。
        for (const storage of this.#destinations) {
          try {
            if (!(await storage.exists(context, signal, key))) {
              continue;
            }
            data = await storage.read(context, signal, key);
            break;
          } catch (ex) {
            if (signal.aborted) {
              throw ex;
            }
            errors.push({ reason: ex });
            logger.error`Failed to read from a storage: ${ex}`;
          }
        }
      } finally {
        lock.release();
      }

      if (data === NONE) {
        const options: ErrorOptions = {};
        switch (errors.length) {
          case 0:
            break;
          case 1:
            options.cause = errors[0]!.reason;
            break;
          default:
            options.cause = new PluginOperationAggregateError({
              plugin: "storage",
              action: "read",
              errors,
            });
        }

        throw new KeyNotFoundError({ key }, options);
      }

      // トランスフォーマーを逆順に適用してデータをデコードします。
      if (this.#transformers.length > 0) {
        for (const transformer of this.#transformers.toReversed()) {
          data = await transformer.decode(context, signal, data);
        }
      }

      return data;
    } finally {
      lock.release();
    }
  }

  /**
   * 指定したオプションでストリームを取得します。
   *
   * @template TKey 対象キーの型定義です。
   * @param options ストリーム取得操作のオプション一式です。
   * @returns 取得したストリームを返します。
   */
  public stream<const TKey extends KeyofKeyValueMappingHasStreamValue<TKeyValueMapping>>(
    options: StreamOptions<TKey>,
  ): Promise<ValueStream<$InferStreamValueChunkData<TKeyValueMapping[TKey]>>>;

  /**
   * 指定したキーからストリームを取得します。
   *
   * @template TKey 対象キーの型定義です。
   * @param key 操作対象を識別するためのキーです。
   * @param options 追加のオプションです。
   * @returns 取得したストリームを返します。
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
    const { key, signal: signalOption, context: contextOption } = options;

    const { ac, io } = this.#con;
    const signal = combineSignals([ac.signal, signalOption]);

    const context = mergeContext(this.#context, contextOption);
    context["unikvs:action"] = "stream";
    context["unikvs:key"] = key;

    const lock = await asyncmux(this, signal);
    try {
      // ロック待機中に接続状態が変更されていないか再確認します。
      if (this.#con === null) {
        throw new UniKvsIsNotOpenError();
      }

      const NONE: any = {};
      let r: IReadableStream = NONE;
      const errors: { reason: unknown }[] = [];

      const lock = await io.rLock({ key, signal });
      try {
        // 各ストレージを巡回し、最初に見つかったデータを取得します。
        // あるストレージの読み取りに失敗しても、他のストレージから
        // データを取得できるようにフォールバックします。
        for (const storage of this.#destinations) {
          try {
            if (!(await storage.exists(context, signal, key))) {
              continue;
            }

            r = await storage.getReadable(context, signal, key);
            break;
          } catch (ex) {
            if (signal.aborted) {
              throw ex;
            }

            errors.push({ reason: ex });
            logger.error`Failed to read from a storage: ${ex}`;
          }
        }

        if (r === NONE) {
          const options: ErrorOptions = {};
          switch (errors.length) {
            case 0:
              break;
            case 1:
              options.cause = errors[0]!.reason;
              break;
            default:
              options.cause = new PluginOperationAggregateError({
                plugin: "storage",
                action: "read",
                errors,
              });
          }

          throw new KeyNotFoundError({ key }, options);
        }

        // トランスフォーマーを逆順に適用し、デコード用トランスフォームを連結します。
        if (this.#transformers.length > 0) {
          for (const transformer of this.#transformers.toReversed()) {
            const d = await transformer.getDecodable(context, signal);
            r = r.pipeThrough(d);
          }
        }

        if (!ioLockRegistry) {
          return toValueStream(r, async () => {
            try {
              lock.release();
            } catch {}
          });
        }

        const unregisterToken = {};
        const valueStream = toValueStream(r, async () => {
          try {
            ioLockRegistry.unregister(unregisterToken);
          } catch {}
          try {
            lock.release();
          } catch {}
        });

        // valueStream が GC されるタイミングでストリームが終了していなければロックを自動解放します。
        ioLockRegistry.register(valueStream, lock, unregisterToken);

        return valueStream;
      } catch (ex) {
        lock.release();
        throw ex;
      }
    } finally {
      lock.release();
    }
  }

  /**
   * 指定したオプションでキーの存在を確認します。
   *
   * @param options 存在確認操作のオプションです。
   * @returns 存在する場合は true、そうでない場合は false を返します。
   */
  public has(options: HasOptions<KeyofKeyValueMapping<TKeyValueMapping>>): Promise<boolean>;

  /**
   * 指定したキーが存在するかを確認します。
   *
   * @param key 操作対象を識別するためのキーです。
   * @param options 追加のオプションです。
   * @returns 存在する場合は true、そうでない場合は false を返します。
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
    const { key, signal: signalOption, context: contextOption } = options;

    const { ac, io } = this.#con;
    const signal = combineSignals([ac.signal, signalOption]);

    const context = mergeContext(this.#context, contextOption);
    context["unikvs:action"] = "has";
    context["unikvs:key"] = key;

    const lock = await asyncmux(this, signal);
    try {
      // ロック待機中に接続状態が変更されていないか再確認します。
      if (this.#con === null) {
        throw new UniKvsIsNotOpenError();
      }

      const lock = await io.rLock({ key, signal });
      try {
        // いずれかのストレージに存在すれば true を返します。
        for (const storage of this.#destinations) {
          if (await storage.exists(context, signal, key)) {
            return true;
          }
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
   * 指定したオプションでキーを削除します。
   *
   * @param options 削除操作のオプションです。
   * @returns 完了を通知する Promise です。
   */
  public delete(options: DeleteOptions<KeyofKeyValueMapping<TKeyValueMapping>>): Promise<void>;

  /**
   * 指定したキーを削除します。
   *
   * @param key 操作対象を識別するためのキーです。
   * @param options 追加のオプションです。
   * @returns 完了を通知する Promise です。
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
    const { key, signal: signalOption, context: contextOption } = options;

    const { ac, io } = this.#con;
    const signal = combineSignals([ac.signal, signalOption]);

    const context = mergeContext(this.#context, contextOption);
    context["unikvs:action"] = "delete";
    context["unikvs:key"] = key;

    const lock = await asyncmux(this, signal);
    try {
      // ロック待機中に接続状態が変更されていないか再確認します。
      if (this.#con === null) {
        throw new UniKvsIsNotOpenError();
      }

      const lock = await io.lock({ key, signal });
      try {
        // すべてのストレージから対象データを削除します。
        // すべての処理を並列に実行し、エラーが発生した場合は集約します。
        const errors: { reason: unknown }[] = [];
        await Promise.all(
          this.#destinations.map(async (storage) => {
            try {
              if (await storage.exists(context, signal, key)) {
                await storage.delete(context, signal, key);
              }
            } catch (reason) {
              errors.push({ reason });
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
   * すべてのストレージ内のデータを全削除します。
   *
   * @param options クリア操作のオプションです。
   * @returns 完了を通知する Promise です。
   */
  public async clear(options?: ClearOptions): Promise<void>;

  public async clear(...args: any): Promise<void> {
    if (this.#con === null) {
      throw new UniKvsIsNotOpenError();
    }

    const [options = {}] = v.parseInput(ClearArgsSchema, args);
    const { signal: signalOption, context: contextOption } = options;

    const { ac, io } = this.#con;
    const signal = combineSignals([ac.signal, signalOption]);

    const context = mergeContext(this.#context, contextOption);
    context["unikvs:action"] = "clear";

    const lock = await asyncmux(this, signal);
    try {
      // ロック待機中に接続状態が変更されていないか再確認します。
      if (this.#con === null) {
        throw new UniKvsIsNotOpenError();
      }

      const lock = await io.lock({ signal });
      try {
        // すべてのストレージで一括削除を実行します。
        // すべての処理を並列に実行し、エラーが発生した場合は集約します。
        const errors: { reason: unknown }[] = [];
        await Promise.all(
          this.#destinations.map(async (storage) => {
            try {
              await storage.clear(context, signal);
            } catch (reason) {
              errors.push({ reason });
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
