import { type IMiddleware, type IReadableStream, RepairNotAllowedError } from "@unikvs/core";
import { combineSignals, throwIfAborted } from "abort-signal-utils";
import { type AsyncmuxLock, Asyncmux, asyncmux } from "asyncmux";

import {
  type VariablesInit,
  type VariablesEntry,
  type VariablesStore,
  GetContext,
  HasContext,
  SetContext,
  OpenContext,
  ClearContext,
  CloseContext,
  DeleteContext,
  StreamContext,
  createVariablesStore,
} from "./_contexts.js";
import { logger, repairLogger } from "./_logger.js";
import type UniKvsMiddleware from "./_middleware.js";
import type { PipelineGraph } from "./_pipeline-graph.js";
import type { PipelineLeaf, ResolvedLeaf, StreamEncodeTarget } from "./_pipeline-graph.types.js";
import { cancelStreams, isReadableStream } from "./_streams.js";
import toValueStream from "./_to-value-stream.js";
import {
  GetArgsSchema,
  HasArgsSchema,
  SetArgsSchema,
  OpenArgsSchema,
  ClearArgsSchema,
  CloseArgsSchema,
  DeleteArgsSchema,
  StreamArgsSchema,
  VariablesArgsSchema,
} from "./_unikvs.schemas.js";
import { parseInput, parseOutput } from "./_valibot.js";
import type {
  ValueSchemaInfo,
  $InferPlainValueData,
  IValueSchemaResolver,
  $InferStreamValueChunkData,
} from "./_value-schemas.js";
import { parseSetValue } from "./_value-validation.js";
import {
  type KeyNotFoundErrorArgs,
  KeyNotFoundError,
  UniKvsIsOpenError,
  UniKvsIsNotOpenError,
  MiddlewareNextNotCalledError,
  MiddlewareNextNotAwaitedError,
  PluginOperationAggregateError,
  MiddlewareNextCalledMultipleTimesError,
} from "./errors.js";
import type { IValueStream } from "./types.js";
import type { KeyValueMapping } from "./unikvs-branch.js";
import type {
  SetValue,
  GetOptions,
  HasOptions,
  SetOptions,
  OpenOptions,
  ClearOptions,
  CloseOptions,
  DeleteOptions,
  StreamOptions,
  KeyofKeyValueMapping,
  KeyofKeyValueMappingHasPlainValue,
  KeyofKeyValueMappingHasStreamValue,
} from "./unikvs.types.js";

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
        // oxlint-disable-next-line promise/prefer-await-to-then
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
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#client-operations)
 */
export default class UniKvs<TKeyValueMapping extends KeyValueMapping = KeyValueMapping> {
  /**
   * 現在の接続状態です。非接続時は null となります。
   */
  #con: Connection | null;

  readonly #acSet: Set<AbortController>;

  /**
   * 基本となる実行変数情報です。
   *
   * コンストラクターで受け取った初期値をエントリー列で保持します。操作ごとに複写して使用します。
   */
  #baseVars: readonly VariablesEntry[];

  /**
   * コンパイル済みのパイプライン・グラフです。
   */
  readonly #pipeline: PipelineGraph;

  /**
   * キーに対応する値のスキーマ情報を解決するリゾルバーです。スキーマ未設定時は null となります。
   */
  readonly #valueSchemaResolver: IValueSchemaResolver | null;

  /**
   * @internal
   */
  public constructor(
    vars: readonly VariablesEntry[],
    pipeline: PipelineGraph,
    valueSchemaResolver: IValueSchemaResolver | null = null,
  ) {
    this.#con = null;
    this.#acSet = new Set();
    this.#baseVars = vars;
    this.#pipeline = pipeline;
    this.#valueSchemaResolver = valueSchemaResolver;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#base-vars-set-vars)
   */
  public setVars(vars: VariablesInit): this;
  public setVars(...args: unknown[]): this {
    const [vars] = parseInput(VariablesArgsSchema, args);
    this.#baseVars = vars;

    return this;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#base-vars-assign-vars)
   */
  public assignVars(vars: VariablesInit): this;
  public assignVars(...args: unknown[]): this {
    const [vars] = parseInput(VariablesArgsSchema, args);

    const map = new Map(this.#baseVars);

    for (const [name, value] of vars) {
      map.set(name, value);
    }

    this.#baseVars = [...map];

    return this;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#base-vars-defaults-vars)
   */
  public defaultsVars(vars: VariablesInit): this;
  public defaultsVars(...args: unknown[]): this {
    const [vars] = parseInput(VariablesArgsSchema, args);

    const map = new Map(vars);

    for (const [name, value] of this.#baseVars) {
      map.set(name, value);
    }

    this.#baseVars = [...map];

    return this;
  }

  /**
   * 基本変数と操作固有変数を結合した実行時変数マップを作成します。
   *
   * @param vars 操作固有の変数です。
   *
   * @returns 結合した変数マップを返します。
   */
  #createOperationVars(vars: readonly VariablesEntry[] | undefined): Map<string, unknown> {
    const map = new Map(this.#baseVars);

    if (vars) {
      for (const [k, v] of vars) {
        map.set(k, v);
      }
    }

    return map;
  }

  /**
   * 操作内で共有される変数ストアを作成します。
   *
   * 同一操作内の全コンテキスト (`use`/`encode`/`decode`/ ストレージ) で共有され、下流の `set` が上流の `await next()` 後の `get` に見えます。
   *
   * @param vars 操作固有の変数です。
   *
   * @returns 共有ストアを返します。
   */
  #createOperationStore(vars: readonly VariablesEntry[] | undefined): VariablesStore {
    return createVariablesStore([...this.#baseVars, ...(vars ?? [])]);
  }

  /**
   * キーに対応する値のスキーマ情報を解決します。
   *
   * @param key 解決するキーです。
   *
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
   *
   * @returns `KeyNotFoundError` を返します。
   */
  #notFound(key: string, errors: readonly PluginErrorRecord[]): KeyNotFoundError {
    const args: KeyNotFoundErrorArgs = { key };

    switch (errors.length) {
      case 0: {
        break;
      }

      case 1: {
        const [firstError] = errors;

        if (firstError !== undefined) {
          args.cause = firstError.reason;
        }

        break;
      }

      default: {
        args.cause = new PluginOperationAggregateError({
          action: "read",
          errors,
          plugin: "storage",
        });
      }
    }

    return new KeyNotFoundError(args);
  }

  public get isOpen(): boolean {
    return this.#con !== null;
  }

  public open(options?: OpenOptions): Promise<void>;
  // oxlint-disable-next-line typescript/explicit-module-boundary-types
  public async open(...args: any): Promise<void> {
    if (this.#con !== null) {
      throw new UniKvsIsOpenError();
    }

    const [options = {}] = parseInput(OpenArgsSchema, args);
    const { vars: varsOption, signal: signalOption } = options;

    const ac = new AbortController();
    const signal = combineSignals([ac.signal, signalOption]);

    const operationVars = this.#createOperationVars(varsOption);
    throwIfAborted(signal);
    this.#acSet.add(ac);

    const dispose: (() => Promise<void>)[] = [];

    try {
      using _lock = await asyncmux(this, signal);

      try {
        if (this.#con !== null) {
          throw new UniKvsIsOpenError();
        }

        const openFns: [
          () => Promise<void>,
          plugin: "storage" | "middleware",
          name: string,
          index: number,
        ][] = [];

        // open/close 用の vars はプラグインごとに複製し、並列実行中の変更が他に見えないようにします。
        for (const [index, leaf] of this.#pipeline.leaves.entries()) {
          openFns.push([
            async (): Promise<void> => {
              const pluginVars = new Map(operationVars);
              const c = new OpenContext({
                vars: pluginVars.entries(),
                signal,
              });
              await leaf.storage.open(c);
              dispose.push(async () => {
                try {
                  const cc = new CloseContext({
                    vars: pluginVars.entries(),
                    signal,
                  });
                  await leaf.storage.close(cc);
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

        // 各ミドルウェアのオープン処理をリストに追加します。
        // ストレージと同様にプラグインごとに複製し、並列実行中の変更が互いに見えないようにします。
        for (const [index, middleware] of this.#pipeline.middlewares.entries()) {
          openFns.push([
            async (): Promise<void> => {
              const pluginVars = new Map(operationVars);
              const c = new OpenContext({
                vars: pluginVars.entries(),
                signal,
              });
              await middleware.open(c);
              dispose.push(async () => {
                try {
                  const cc = new CloseContext({
                    vars: pluginVars.entries(),
                    signal,
                  });
                  await middleware.close(cc);
                } catch (ex) {
                  logger.error`Failed to close middleware: ${ex}`;
                }
              });
            },
            "middleware",
            middleware.name,
            index,
          ]);
        }

        // すべての処理を並列に実行し、エラーが発生した場合は集約します。
        const errors: {
          name: string;
          index: number;
          plugin: "storage" | "middleware";
          reason: unknown;
        }[] = [];
        await Promise.all(
          openFns.map(async ([f, plugin, name, index]) => {
            try {
              await f();
            } catch (ex) {
              errors.push({
                name,
                index,
                plugin,
                reason: ex,
              });
            }
          }),
        );

        if (errors.length > 0) {
          // 中断以外の失敗が混ざっていないときは、abort 理由が集約エラーに埋もれないようそのまま投げます。
          if (signal.aborted && errors.every((error) => error.reason === signal.reason)) {
            throw signal.reason;
          }

          throw new PluginOperationAggregateError({
            action: "open",
            errors,
          });
        }

        // すべてのプラグインのオープンが成功した後も、待機中に中断されていないか最終確認します。
        // 中断済みのシグナルを持つ接続を作ると、isOpen が true なのに以降の操作がすべて即座に失敗する不整合な状態になります。
        throwIfAborted(signal);

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
      }
    } finally {
      this.#acSet.delete(ac);
    }
  }

  async #close(
    operationVars: Map<string, unknown>,
    signal: AbortSignal,
    con: Connection,
    progress: { pluginsStarted: boolean },
  ): Promise<void> {
    using _lock = await asyncmux(this, signal);
    // ロック待機中に接続状態が変更されていないか再確認します。
    if (this.#con !== con) {
      throw new UniKvsIsNotOpenError();
    }

    const { io } = this.#con;
    using _ioLock = await io.lock({ signal });
    const closeFns: [
      () => Promise<void>,
      () => Promise<void>,
      plugin: "storage" | "middleware",
      name: string,
      index: number,
    ][] = [];

    // ストレージのクローズ処理を登録します。
    // open と同じ方針でプラグインごとに複製し、並列実行中の変更が互いに見えないようにします。
    for (const [index, leaf] of this.#pipeline.leaves.entries()) {
      const createContext = (): CloseContext =>
        new CloseContext({
          vars: new Map(operationVars).entries(),
          signal,
        });
      // 再試行は通常 close の失敗 (操作 signal の abort など) に引きずられないよう、新しいタイムアウト signal を使います。
      const createRetryContext = (): CloseContext =>
        new CloseContext({
          vars: new Map(operationVars).entries(),
          signal: AbortSignal.timeout(10e3),
        });
      closeFns.push([
        (): Promise<void> => leaf.storage.close(createContext()),
        (): Promise<void> => leaf.storage.retryClose(createRetryContext()),
        "storage",
        leaf.name,
        index,
      ]);
    }

    // ミドルウェアのクローズ処理を登録します。
    for (const [index, plugin] of this.#pipeline.middlewares.entries()) {
      const createContext = (): CloseContext =>
        new CloseContext({
          vars: new Map(operationVars).entries(),
          signal,
        });
      // 再試行は通常 close の失敗 (操作 signal の abort など) に引きずられないよう、新しいタイムアウト signal を使います。
      const createRetryContext = (): CloseContext =>
        new CloseContext({
          vars: new Map(operationVars).entries(),
          signal: AbortSignal.timeout(10e3),
        });
      closeFns.push([
        (): Promise<void> => plugin.close(createContext()),
        (): Promise<void> => plugin.retryClose(createRetryContext()),
        "middleware",
        plugin.name,
        index,
      ]);
    }

    // すべての処理を並列に実行し、エラーが発生した場合は集約します。
    progress.pluginsStarted = true;
    const errors: {
      name: string;
      index: number;
      plugin: "storage" | "middleware";
      reason: unknown;
    }[] = [];
    const retries: (() => Promise<void>)[] = [];
    await Promise.all(
      closeFns.map(async ([f, retry, plugin, name, index]) => {
        try {
          await f();
        } catch (ex) {
          errors.push({
            name,
            index,
            plugin,
            reason: ex,
          });
          // 通常の close で再試行すると、close 失敗後に別の利用者が引き継いだ参照まで解放してしまいます。
          retries.push(retry);
        }
      }),
    );

    if (errors.length > 0) {
      // 失敗したプラグインだけを 1 回再試行します。
      // 成功済みのプラグインを再 close すると、参照カウントが二重に解放され、共有している他の利用者の実体まで閉じてしまうためです。
      await Promise.all(
        retries.map(async (f) => {
          try {
            await f();
          } catch (ex) {
            logger.error`Failed to retry closing a plugin: ${ex}`;
          }
        }),
      );

      throw new PluginOperationAggregateError({
        action: "close",
        errors,
      });
    }

    this.#con = null;
  }

  public close(options?: CloseOptions): Promise<void>;
  // oxlint-disable-next-line typescript/explicit-module-boundary-types
  public close(...args: any): Promise<void> {
    try {
      const [options = {}] = parseInput(CloseArgsSchema, args);
      const { vars: varsOption, signal = AbortSignal.timeout(10e3) } = options;

      const operationVars = this.#createOperationVars(varsOption);

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

      for (const targetAc of acArr) {
        if (!targetAc.signal.aborted) {
          targetAc.abort(new UniKvsIsNotOpenError());
        }
      }

      const progress = { pluginsStarted: false };

      return this.#close(operationVars, signal, con, progress).catch(async (closeError) => {
        // #close が失敗した場合、コネクションの AbortController はすでに abort 済みで、以降の操作がすべて即座に失敗する不整合な状態になります。
        // そこで接続を破棄して isOpen=false の一貫した状態に戻します。
        if (this.#con === con) {
          this.#con = null;

          // プラグインの close 段階まで到達していれば、成功分の参照は解放済みで、失敗分は #close が再試行済みです。
          // ここで全プラグインを再度閉じると参照を二重解放してしまうため、close 段階に到達できなかったときだけ破棄します。
          if (!progress.pluginsStarted) {
            const disposeSignal = AbortSignal.timeout(10e3);
            await Promise.all(
              [
                ...this.#pipeline.leaves.map((leaf) => leaf.storage),
                ...this.#pipeline.middlewares,
              ].map(async (plugin) => {
                try {
                  const c = new CloseContext({
                    vars: new Map(operationVars).entries(),
                    signal: disposeSignal,
                  });
                  await plugin.close(c);
                } catch (disposeError) {
                  logger.error`Failed to close plugin after close failure: ${disposeError}`;
                }
              }),
            );
          }
        }

        throw closeError;
      });
    } catch (ex) {
      return Promise.reject(ex);
    }
  }

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
      readonly key: string;
      readonly leaf: PipelineLeaf;
    }[],
    store: VariablesStore,
    failed: ReadonlySet<PipelineLeaf>,
    errors: PluginErrorRecord[],
    signal: AbortSignal,
  ): Promise<void> {
    if (errors.length === 0) {
      return;
    }

    const error = new PluginOperationAggregateError({
      action: "write",
      errors,
      plugin: "storage",
    });
    const notifyErrors: unknown[] = [];
    await Promise.all(
      targets.map(async (target) => {
        // 失敗した宛先を除いたすべての宛先へ通知します。通知に失敗しても元の集約エラーは置き換えません。
        if (failed.has(target.leaf)) {
          return;
        }

        try {
          const c = new SetContext({
            key: target.key,
            store,
            signal,
          });
          await target.leaf.storage.onOtherWriteError(c, error);
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
   * ミドルウェアの `use` をオニオン実行し、失敗時は集約して投げます。
   *
   * 同一コンテキストオブジェクトを全ミドルウェアで共有し、`next` で下流をネスト実行するため、下流の `set` が上流の `await next()` 後の `get` に見えます。
   * `encode`/`decode` と同じく `next()` の呼び出し規約を検証し、違反したときは操作を実行せず失敗させます (fail-close)。
   * いずれかのミドルウェアが投げたときは即時に確定し、後段は実行しません (fail-fast)。
   * 失敗は集約エラー (単一件) として投げます。
   *
   * @param action 集約エラーに付与する操作名です。
   * @param c 共有の `use` コンテキストです。
   */
  async #use(
    action: "read" | "write" | "delete" | "clear",
    c: IMiddleware.UseContext,
  ): Promise<void> {
    throwIfAborted(c.signal);

    const middlewares = this.#pipeline.middlewares;
    const dispatch = async (index: number): Promise<void> => {
      const maybeMiddleware = middlewares[index];

      if (maybeMiddleware === undefined) {
        return;
      }

      const middleware: UniKvsMiddleware = maybeMiddleware;

      let nextCalled = false;
      let nextSettled = false;
      let downstreamError: unknown;
      let hasDownstreamError = false;

      function next(): Promise<void> {
        if (nextCalled) {
          // 2 回目以降の `next()` は下流を実行せず拒否だけを返します。
          const rejection = Promise.reject(
            new MiddlewareNextCalledMultipleTimesError({
              name: middleware.name,
              operation: "use",
            }),
          );
          // 呼び出し側が切り離した場合の未処理 rejection を防ぎます。await したときは従来どおり拒否されます。
          // oxlint-disable-next-line promise/prefer-await-to-then
          rejection.catch(() => {});

          return rejection;
        }

        nextCalled = true;

        const promise = Promise.try(async () => {
          try {
            await dispatch(index + 1);
          } catch (ex) {
            // 下流の失敗を親自身の失敗と取り違えないよう、由来を記録します。
            downstreamError = ex;
            hasDownstreamError = true;
            throw ex;
          } finally {
            nextSettled = true;
          }
        });
        // 呼び出し側が切り離した場合の未処理 rejection を防ぎます。await したときは従来どおり拒否されます。
        // oxlint-disable-next-line promise/prefer-await-to-then
        promise.catch(() => {});

        return promise;
      }

      try {
        await middleware.use(c, next);
        throwIfAborted(c.signal);
        if (!nextCalled) {
          throw new MiddlewareNextNotCalledError({
            name: middleware.name,
            operation: "use",
          });
        }

        if (!nextSettled) {
          throw new MiddlewareNextNotAwaitedError({
            name: middleware.name,
            operation: "use",
          });
        }
      } catch (ex) {
        // 中断による失敗はそのまま投げます。
        if (c.signal.aborted && ex === c.signal.reason) {
          throw ex;
        }

        // 規約違反はプログラミングエラーであり、集約せずに投げます。
        if (
          ex instanceof MiddlewareNextNotCalledError ||
          ex instanceof MiddlewareNextNotAwaitedError ||
          ex instanceof MiddlewareNextCalledMultipleTimesError
        ) {
          throw ex;
        }

        // `next()` から伝播した下流の失敗は再集約せず、そのまま投げます。
        if (hasDownstreamError && ex === downstreamError) {
          throw ex;
        }

        throw new PluginOperationAggregateError({
          action,
          errors: [
            {
              name: middleware.name,
              index,
              reason: ex,
            },
          ],
          plugin: "middleware",
        });
      }
    };
    await dispatch(0);
  }

  /**
   * プレーン値の並列書き込みを行います。
   *
   * @param io 多重化インスタンスです。
   * @param signal 中断シグナルです。
   * @param key 書き込みキーです。
   * @param store 操作内で共有される変数ストアです。
   * @param value 書き込む値です.
   */
  async #setPlain(
    io: Asyncmux,
    signal: AbortSignal,
    key: string,
    store: VariablesStore,
    value: unknown,
  ): Promise<void> {
    const targets = await this.#pipeline.encode(
      {
        key,
        store,
        signal,
      },
      value,
    );
    using _ioLock = await io.lock({
      key,
      signal,
    });
    const errors: PluginErrorRecord[] = [];
    const failed = new Set<PipelineLeaf>();
    await Promise.all(
      targets.map(async (target) => {
        try {
          const c = new SetContext({
            key: target.key,
            store,
            signal,
          });
          await target.leaf.storage.write(c, target.data);
        } catch (ex) {
          errors.push({
            name: target.leaf.name,
            index: target.leaf.index,
            reason: ex,
          });
          failed.add(target.leaf);
        }
      }),
    );
    await this.#finishWrites(targets, store, failed, errors, signal);
  }

  /**
   * ストリーム値の並列書き込みを行います。
   *
   * @param io 多重化インスタンスです。
   * @param signal 中断シグナルです。
   * @param key 書き込みキーです。
   * @param store 操作内で共有される変数ストアです。
   * @param value 書き込むストリームです。
   */
  async #setStream(
    io: Asyncmux,
    signal: AbortSignal,
    key: string,
    store: VariablesStore,
    value: IReadableStream,
  ): Promise<void> {
    const streams = new Set<IReadableStream>([value]);
    let tree;

    try {
      tree = await this.#pipeline.buildEncodeTree(
        {
          key,
          store,
          signal,
        },
        value,
        streams,
      );
    } catch (ex) {
      await cancelStreams(streams, ex);
      throw ex;
    }

    using _ioLock = await io
      .lock({
        key,
        signal,
      })
      .catch(async (ex) => {
        // キーロックの待機中に中断されたときも、構築済みのストリームをキャンセルします。
        // ソースストリームをロックしたまま残さないためです。
        await cancelStreams(streams, ex);
        throw ex;
      });

    const errors: PluginErrorRecord[] = [];
    const failed = new Set<PipelineLeaf>();
    await Promise.all(
      tree.targets.map(async (target) => {
        try {
          const c = new SetContext({
            key: target.key,
            store,
            signal,
          });
          const w = await target.leaf.storage.getWritable(c);
          await target.stream.pipeTo(w, { signal });
        } catch (ex) {
          // tee で分岐したストリームは、片方の分岐をキャンセルするまで他方が読み取ったチャンクを保持し続けるため、失敗時に放棄した分岐は確実にキャンセルします。
          try {
            await target.stream.cancel(ex);
          } catch {
            // キャンセルに失敗してもエラー集約を優先します。
          }

          errors.push({
            name: target.leaf.name,
            index: target.leaf.index,
            reason: ex,
          });
          failed.add(target.leaf);
        }
      }),
    );
    await this.#finishWrites(tree.targets, store, failed, errors, signal);
  }

  public set<const TKey extends KeyofKeyValueMapping<TKeyValueMapping>>(
    options: SetOptions<TKeyValueMapping, TKey>,
  ): Promise<void>;
  public set<const TKey extends KeyofKeyValueMapping<TKeyValueMapping>>(
    key: TKey,
    value: SetValue<TKeyValueMapping[TKey]>,
    options?: Omit<SetOptions, "key" | "value">,
  ): Promise<void>;
  // oxlint-disable-next-line typescript/explicit-module-boundary-types
  public async set(...args: any): Promise<void> {
    if (this.#con === null) {
      throw new UniKvsIsNotOpenError();
    }

    const [options] = parseInput(SetArgsSchema, args);
    const { key, vars: varsOption, signal: signalOption } = options;

    const valueSchema = this.#resolveValueSchema(key);
    // スキーマ検証はロック取得前に済ませ、無効な入力ではロックを取得しません。
    const value = valueSchema ? parseSetValue(valueSchema, options.value) : options.value;

    const { ac, io } = this.#con;
    const signal = combineSignals([ac.signal, signalOption]);

    const store = this.#createOperationStore(varsOption);

    // `#setStream` へ所有権を渡す前の失敗では、ソースをロックしたままにしないよう派生ストリームをキャンセルします。
    const stream = isReadableStream(value) ? value : null;
    let ownsStream = stream !== null;

    try {
      using _lock = await asyncmux.readonly(this, signal);
      // ロック待機中に接続状態が変更されていないか再確認します。
      if (this.#con === null) {
        throw new UniKvsIsNotOpenError();
      }

      // 書き込み前の `use` による検証を行います。変異は後続のエンコード・書き込みに引き継がれます。
      const useContext = new SetContext({
        key,
        store,
        signal,
      });
      await this.#use("write", useContext);
      // `use` の完了直後に中断を確認し、後続処理での検出に依存しないようにします。
      throwIfAborted(signal);
      // `use` による変異を操作変数に反映します。
      // ロックはインスタンス (読み取り) からキーの順で取得し、逆順で解放します。
      if (stream !== null) {
        // これ以降の後始末は `#setStream` が所有します。
        ownsStream = false;
        await this.#setStream(io, signal, key, store, stream);
      } else {
        await this.#setPlain(io, signal, key, store, value);
      }
    } catch (ex) {
      if (ownsStream && stream !== null) {
        // 消費されないストリームをキャンセルし、ソースの解放を伝播させます。
        try {
          await stream.cancel(ex);
        } catch {
          // キャンセルに失敗しても元の例外の伝播を優先します。
        }
      }

      throw ex;
    }
  }

  /**
   * 読み取り元のチェーン全体を逆順にデコードし、書き戻し対象向けに再エンコードして書き込みます。
   *
   * @param data 読み取ったデータです。
   * @param hit 読み取り元の葉です。
   * @param missing 読み取りに失敗または不在だった葉です。
   * @param store 操作内で共有される変数ストアです。
   * @param key キーです。
   * @param signal 中断シグナルです。
   * @param throwOnRepairDenied 書き戻し拒否をエラーとして投げるかどうかです。
   *
   * @returns デコード済みの原データを返します。
   */
  async #repairPlain(
    data: unknown,
    hit: ResolvedLeaf,
    missing: readonly PipelineLeaf[],
    store: VariablesStore,
    key: string,
    signal: AbortSignal,
    throwOnRepairDenied: boolean,
  ): Promise<unknown> {
    const raw = await this.#pipeline.decode(
      hit.leaf,
      {
        key,
        store,
        signal,
      },
      data,
    );
    await this.#pipeline.repair(
      {
        key,
        store,
        signal,
      },
      missing,
      throwOnRepairDenied,
      raw,
      async (leaf, writeKey, input) => {
        const c = new SetContext({
          key: writeKey,
          store,
          signal,
        });
        await leaf.storage.write(c, input);
      },
    );

    throwIfAborted(signal);

    return raw;
  }

  public get<const TKey extends KeyofKeyValueMappingHasPlainValue<TKeyValueMapping>>(
    options: GetOptions<TKey>,
  ): Promise<$InferPlainValueData<TKeyValueMapping[TKey]>>;
  public get<const TKey extends KeyofKeyValueMappingHasPlainValue<TKeyValueMapping>>(
    key: TKey,
    options?: Omit<GetOptions, "key">,
  ): Promise<$InferPlainValueData<TKeyValueMapping[TKey]>>;
  // oxlint-disable-next-line typescript/explicit-module-boundary-types
  public async get(...args: any): Promise<unknown> {
    if (this.#con === null) {
      throw new UniKvsIsNotOpenError();
    }

    const [options] = parseInput(GetArgsSchema, args);
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

    const store = this.#createOperationStore(varsOption);

    using _lock = await asyncmux.readonly(this, signal);
    // ロック待機中に接続状態が変更されていないか再確認します。
    if (this.#con === null) {
      throw new UniKvsIsNotOpenError();
    }

    // 読み取り前の `use` による検証を行います。書き戻し要求は `repair` フィールドで伝えます。
    const leafNames = this.#pipeline.leaves.map((leaf) => leaf.name);
    const useContext = new GetContext({
      key,
      store,
      repair: repair
        ? {
            enabled: true,
            targets: leafNames as [string, ...string[]],
          }
        : {
            enabled: false,
            targets: [],
          },
      signal,
    });
    await this.#use("read", useContext);
    // `use` の完了直後に中断を確認し、後続処理での検出に依存しないようにします。
    throwIfAborted(signal);
    let data: unknown = undefined;
    let hit: ResolvedLeaf | null = null;
    const missing: PipelineLeaf[] = [];
    const errors: PluginErrorRecord[] = [];

    // 書き戻し時は、読み取りから書き込みまでを同じキーの書き込みと直列化するため、書き込みロックを取得します。
    {
      using _ioLock = await (repair
        ? io.lock({
            key,
            signal,
          })
        : io.rLock({
            key,
            signal,
          }));
      // 登録順が読み取りの優先順です。先頭で見つかればそこで終え、失敗したときは次の宛先を試します。
      const resolver = this.#pipeline.createResolver({
        key,
        store,
        signal,
      });

      for (const leaf of this.#pipeline) {
        const resolved = resolver.resolve(leaf);
        const existsContext = new HasContext({
          key: resolved.key,
          store,
          signal,
        });
        const readRepair = repair
          ? {
              enabled: true as const,
              targets: leafNames as [string, ...string[]],
            }
          : {
              enabled: false as const,
              targets: [] as const,
            };
        const readContext = new GetContext({
          key: resolved.key,
          store,
          repair: readRepair,
          signal,
        });

        try {
          if (!(await leaf.storage.exists(existsContext))) {
            missing.push(leaf);
            continue;
          }

          data = await leaf.storage.read(readContext);
          hit = resolved;
          break;
        } catch (ex) {
          if (signal.aborted) {
            throw ex;
          }

          errors.push({
            name: leaf.name,
            index: leaf.index,
            reason: ex,
          });
          logger.error`Failed to read from a storage: ${ex}`;
        }
      }

      if (hit === null) {
        throw this.#notFound(key, errors);
      }

      if (repair) {
        // 後段で見つかったデータをすべてデコードして原データに戻します。
        data = await this.#repairPlain(data, hit, missing, store, key, signal, throwOnRepairDenied);
      }
    }

    if (!repair) {
      // 見つかったストレージ専用の前段パイプラインを逆順に適用して、データをデコードします。
      data = await this.#pipeline.decode(
        hit.leaf,
        {
          key,
          store,
          signal,
        },
        data,
      );
    }

    // デコード後のデータを検証します。
    if (valueSchema) {
      data = parseOutput(valueSchema.schema, data);
    }

    return data;
  }

  public stream<const TKey extends KeyofKeyValueMappingHasStreamValue<TKeyValueMapping>>(
    options: StreamOptions<TKey>,
  ): Promise<IValueStream<$InferStreamValueChunkData<TKeyValueMapping[TKey]>>>;
  public stream<const TKey extends KeyofKeyValueMappingHasStreamValue<TKeyValueMapping>>(
    key: TKey,
    options?: Omit<StreamOptions, "key">,
  ): Promise<IValueStream<$InferStreamValueChunkData<TKeyValueMapping[TKey]>>>;
  // oxlint-disable-next-line typescript/explicit-module-boundary-types
  public async stream(...args: any): Promise<IValueStream> {
    if (this.#con === null) {
      throw new UniKvsIsNotOpenError();
    }

    const [options] = parseInput(StreamArgsSchema, args);
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

    const store = this.#createOperationStore(varsOption);

    {
      using _lock = await asyncmux.readonly(this, signal);
      // ロック待機中に接続状態が変更されていないか再確認します。
      if (this.#con === null) {
        throw new UniKvsIsNotOpenError();
      }

      // 読み取り前の `use` による検証を行います。書き戻し要求は `repair` フィールドで伝えます。
      const leafNames = this.#pipeline.leaves.map((leaf) => leaf.name);
      const useContext = new StreamContext({
        key,
        store,
        repair: repair
          ? {
              enabled: true,
              targets: leafNames as [string, ...string[]],
            }
          : {
              enabled: false,
              targets: [],
            },
        signal,
      });
      await this.#use("read", useContext);
      // `use` の完了直後に中断を確認し、後続処理での検出に依存しないようにします。
      throwIfAborted(signal);
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
      // キーロックは ValueStream の dispose まで保持するため、明示的に解放します。
      const ioLock = await (repair
        ? io.lock({
            key,
            signal,
          })
        : io.rLock({
            key,
            signal,
          }));

      try {
        // 登録順が読み取りの優先順です。先頭で見つかればそこで終え、失敗したときは次の宛先を試します。
        const resolver = this.#pipeline.createResolver({
          key,
          store,
          signal,
        });

        for (const leaf of this.#pipeline) {
          const resolved = resolver.resolve(leaf);
          const existsContext = new HasContext({
            key: resolved.key,
            store,
            signal,
          });
          const readableRepair = repair
            ? {
                enabled: true as const,
                targets: leafNames as [string, ...string[]],
              }
            : {
                enabled: false as const,
                targets: [] as const,
              };
          const readableContext = new StreamContext({
            key: resolved.key,
            store,
            repair: readableRepair,
            signal,
          });

          try {
            if (!(await leaf.storage.exists(existsContext))) {
              missing.push(leaf);
              continue;
            }

            r = await leaf.storage.getReadable(readableContext);
            hit = resolved;
            break;
          } catch (ex) {
            if (signal.aborted) {
              throw ex;
            }

            errors.push({
              name: leaf.name,
              index: leaf.index,
              reason: ex,
            });
            logger.error`Failed to read from a storage: ${ex}`;
          }
        }

        if (hit === null) {
          throw this.#notFound(key, errors);
        }

        // 書き戻しが有効なときだけ、ストリームが途中で破棄されたら進行中の書き戻しも中断できるようにします。
        repairAc = repair ? new AbortController() : null;
        const repairSignal = repairAc ? combineSignals([signal, repairAc.signal]) : signal;

        // 書き戻しはできる範囲で行います。失敗してもログに残すだけで、読み取りは続けます。
        const fill = (target: StreamEncodeTarget): void => {
          fillBranches.push(target.stream);
          fillTasks.push(
            (async (): Promise<void> => {
              try {
                const wc = new SetContext({
                  key: target.key,
                  store,
                  signal: repairSignal,
                });
                const w = await target.leaf.storage.getWritable(wc);
                await target.stream.pipeTo(w, { signal: repairSignal });
              } catch (ex) {
                // パイプが中断されたときは分岐を解放し、tee が後続のチャンクを保持し続けないようにします。
                try {
                  await target.stream.cancel(ex);
                } catch {
                  // 解放に失敗しても書き戻しの失敗処理を優先します。
                }

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
        cancelFills = async (reason: unknown): Promise<void> => {
          repairAc?.abort(reason);
          await Promise.all(
            fillBranches.map(async (branch) => {
              try {
                await branch.cancel(reason);
              } catch {
                // 解放に失敗しても残りの分岐の解放を優先します。
              }
            }),
          );
          await Promise.all(fillTasks);
        };

        // 読み取り元をすべてデコードして原データに戻します。
        // 書き戻しの分岐は読み取りパスと分離します。
        r = await this.#pipeline.decodeStream(
          hit.leaf,
          {
            key,
            store,
            signal,
          },
          r,
        );

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
            const tree = await this.#pipeline.buildEncodeTree(
              {
                key,
                store,
                signal,
              },
              r,
              streams,
              {
                isActive: (leaf: PipelineLeaf) => repairSet.has(leaf),
                splitRead: true,
                onNodeError: (ex: unknown, activeLeaves: readonly PipelineLeaf[]) => {
                  // 意図的な中断時は中断理由で失敗します。
                  throwIfAborted(signal);

                  if (ex instanceof RepairNotAllowedError) {
                    repairLogger.warn`Failed to repair a storage: ${ex}`;

                    if (throwOnRepairDenied) {
                      throw new RepairNotAllowedError({
                        cause: ex,
                        names: activeLeaves.map((leaf) => leaf.name),
                      });
                    }

                    return true;
                  }

                  logger.error`Failed to repair a storage: ${ex}`;

                  throw ex;
                },
              },
            );
            r = tree.readStream;

            for (const target of tree.targets) {
              fill(target);
            }
          }

          throwIfAborted(signal);
        }

        // デコード後のチャンクを検証します。
        if (valueSchema) {
          r = r.pipeThrough(
            new TransformStream({
              transform(chunk, controller): void {
                controller.enqueue(parseOutput(valueSchema.schema, chunk));
              },
            }),
          );
        }

        // ストリームを読み切ったかを監視します。読み切ったときは書き戻しの完了を待ち、途中で破棄されたときは書き戻しを中断します。
        let completed = false;

        if (repairAc) {
          r = r.pipeThrough(
            new TransformStream({
              flush(): void {
                completed = true;
              },
              transform(chunk, controller): void {
                controller.enqueue(chunk);
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
              ioLock.release();
            } catch {
              // 解放済みでも dispose を失敗させません。
            }
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
            } catch {
              // 未登録でも dispose を失敗させません。
            }

            await dispose();
          },
          beforeDispose,
        );

        // valueStream が GC される時点でストリームが終わっていなければロックを自動解放します。あわせて、ソースストリームが保持するリソース (S3 レスポンスボディなど) を解放できるよう dispose を記録します。
        ioLockRegistry.register(
          valueStream,
          {
            lock: ioLock,
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
          } catch {
            // キャンセルに失敗しても元の例外の伝播を優先します。
          }
        }

        ioLock.release();

        throw ex;
      }
    }
  }

  public has(options: HasOptions<KeyofKeyValueMapping<TKeyValueMapping>>): Promise<boolean>;
  public has(
    key: KeyofKeyValueMapping<TKeyValueMapping>,
    options?: Omit<HasOptions, "key">,
  ): Promise<boolean>;
  // oxlint-disable-next-line typescript/explicit-module-boundary-types
  public async has(...args: any): Promise<boolean> {
    if (this.#con === null) {
      throw new UniKvsIsNotOpenError();
    }

    const [options] = parseInput(HasArgsSchema, args);
    const { key, vars: varsOption, signal: signalOption } = options;

    // キーがキースキーマに一致するかを検証します。
    this.#resolveValueSchema(key);

    const { ac, io } = this.#con;
    const signal = combineSignals([ac.signal, signalOption]);

    const store = this.#createOperationStore(varsOption);

    using _lock = await asyncmux.readonly(this, signal);
    // ロック待機中に接続状態が変更されていないか再確認します。
    if (this.#con === null) {
      throw new UniKvsIsNotOpenError();
    }

    // 存在確認に先立ち、各ミドルウェアの `use` を実行します。
    // `use` による vars の変更は後続の解決・走査に引き継がれます。
    const useContext = new HasContext({
      key,
      store,
      signal,
    });
    await this.#use("read", useContext);
    // `use` の完了直後に中断を確認し、後続処理での検出に依存しないようにします。
    throwIfAborted(signal);

    using _ioLock = await io.rLock({
      key,
      signal,
    });
    // 登録順に走査し、いずれかのストレージに存在すれば true を返します。
    // exists に失敗したときは次のストレージを試します。
    const errors: PluginErrorRecord[] = [];
    const resolver = this.#pipeline.createResolver({
      key,
      store,
      signal,
    });

    for (const leaf of this.#pipeline) {
      const resolved = resolver.resolve(leaf);

      try {
        const c = new HasContext({
          key: resolved.key,
          store,
          signal,
        });

        if (await leaf.storage.exists(c)) {
          return true;
        }
      } catch (ex) {
        if (signal.aborted) {
          throw ex;
        }

        errors.push({
          name: leaf.name,
          index: leaf.index,
          reason: ex,
        });

        logger.error`Failed to check existence in a storage: ${ex}`;
      }
    }

    // すべてのストレージで存在を確認できなかったときは結果が不明なため、get() と同様にエラーとして報告します。
    if (errors.length > 0) {
      throw this.#notFound(key, errors);
    }

    return false;
  }

  public delete(options: DeleteOptions<KeyofKeyValueMapping<TKeyValueMapping>>): Promise<void>;
  public delete(
    key: KeyofKeyValueMapping<TKeyValueMapping>,
    options?: Omit<DeleteOptions, "key">,
  ): Promise<void>;
  // oxlint-disable-next-line typescript/explicit-module-boundary-types
  public async delete(...args: any): Promise<void> {
    if (this.#con === null) {
      throw new UniKvsIsNotOpenError();
    }

    const [options] = parseInput(DeleteArgsSchema, args);
    const { key, vars: varsOption, signal: signalOption } = options;

    // キーがキースキーマに一致するかを検証します。
    this.#resolveValueSchema(key);

    const { ac, io } = this.#con;
    const signal = combineSignals([ac.signal, signalOption]);

    const store = this.#createOperationStore(varsOption);

    using _lock = await asyncmux.readonly(this, signal);
    // ロック待機中に接続状態が変更されていないか再確認します。
    if (this.#con === null) {
      throw new UniKvsIsNotOpenError();
    }

    // 削除に先立ち、各ミドルウェアの `use` を実行します。
    // `use` による vars の変更は後続の解決・削除に引き継がれます。
    const useContext = new DeleteContext({
      key,
      store,
      signal,
    });
    await this.#use("delete", useContext);

    using _ioLock = await io.lock({
      key,
      // `use` の完了直後に中断を確認し、後続処理での検出に依存しないようにします。
      signal,
    });
    // 全宛先を並列に削除し、失敗は宛先の index 付きで集約します。
    const errors: PluginErrorRecord[] = [];
    const resolver = this.#pipeline.createResolver({
      key,
      store,
      signal,
    });
    await Promise.all(
      this.#pipeline.leaves.map(async (leaf) => {
        const resolved = resolver.resolve(leaf);
        const existsContext = new HasContext({
          key: resolved.key,
          store,
          signal,
        });
        const deleteContext = new DeleteContext({
          key: resolved.key,
          store,
          signal,
        });

        try {
          if (await leaf.storage.exists(existsContext)) {
            await leaf.storage.delete(deleteContext);
          }
        } catch (ex) {
          errors.push({
            name: leaf.name,
            index: leaf.index,
            reason: ex,
          });
        }
      }),
    );

    if (errors.length > 0) {
      throw new PluginOperationAggregateError({
        action: "delete",
        errors,
        plugin: "storage",
      });
    }
  }

  public async clear(options?: ClearOptions): Promise<void>;
  // oxlint-disable-next-line typescript/explicit-module-boundary-types
  public async clear(...args: any): Promise<void> {
    if (this.#con === null) {
      throw new UniKvsIsNotOpenError();
    }

    const [options = {}] = parseInput(ClearArgsSchema, args);
    const { vars: varsOption, signal: signalOption } = options;

    const { ac, io } = this.#con;
    const signal = combineSignals([ac.signal, signalOption]);

    const store = this.#createOperationStore(varsOption);

    using _lock = await asyncmux.readonly(this, signal);
    // ロック待機中に接続状態が変更されていないか再確認します。
    if (this.#con === null) {
      throw new UniKvsIsNotOpenError();
    }

    using _ioLock = await io.lock({ signal });
    // 全ミドルウェアの `use` を実行します。
    const useContext = new ClearContext({
      store,
      signal,
    });
    await this.#use("clear", useContext);
    // `use` の完了直後に中断を確認し、後続処理での検出に依存しないようにします。
    throwIfAborted(signal);
    // 一括削除は全宛先で並列に実行し、失敗は宛先の index 付きで集約します。
    const errors: PluginErrorRecord[] = [];
    await Promise.all(
      this.#pipeline.leaves.map(async (leaf, index) => {
        try {
          const c = new ClearContext({
            store,
            signal,
          });
          await leaf.storage.clear(c);
        } catch (ex) {
          errors.push({
            name: leaf.name,
            index,
            reason: ex,
          });
        }
      }),
    );

    if (errors.length > 0) {
      throw new PluginOperationAggregateError({
        action: "clear",
        errors,
        plugin: "storage",
      });
    }
  }
}
