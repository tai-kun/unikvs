import {
  type IGetContext,
  type IHasContext,
  type ISetContext,
  type IOpenContext,
  type IClearContext,
  type ICloseContext,
  type IActionContext,
  type IDecodeContext,
  type IDeleteContext,
  type IEncodeContext,
  type IMapKeyContext,
  type IStreamContext,
  type IPipelineContext,
  type IReadableStream,
  type ILifecycleContext,
  type ITransformContext,
  type IKeyedActionContext,
  type IDecodeStreamContext,
  type IEncodeStreamContext,
  type ITransformDataContext,
  type ITransformStreamContext,
  ReadonlyVariableError,
} from "@unikvs/core";

/**
 * 実行時変数の 1 件分の形式です。
 */
export type VariablesEntry = readonly [name: string, value: unknown];

/**
 * 実行時変数の初期値に使えるマップ形式です。
 *
 * レコードまたはエントリーの反復子を受け付けます。
 */
export type VariablesInit = { readonly [name: string]: unknown } | Iterable<VariablesEntry>;

/**
 * 書き戻し要求の形状です。
 *
 * `IGetContext` と `IStreamContext` の `repair` と同じ形状です。
 */
export type PipelineRepair = IGetContext["repair"];

/**
 * 複数のコンテキスト間で共有される変数ストアです。
 *
 * オニオン実行では、操作内の全コンテキストが同一ストアの `data`/`readonlyKeys` を参照し、
 * 下流の `set` を上流が `await next()` の後に `get` で参照できます。
 */
export type VarsStore = {
  /**
   * 変数のマップです。
   */
  readonly data: Map<string, unknown>;

  /**
   * 読み取り専用キー集合です。
   */
  readonly readonlyKeys: Set<string>;
};

/**
 * 新しい空の変数ストアを作成します。
 *
 * @param vars 初期値です。
 * @returns 空ストアを返します。
 */
export function createVarsStore(vars?: VariablesInit): VarsStore {
  return {
    data: new Map<string, unknown>(normalizeEntries(vars)),
    readonlyKeys: new Set<string>(),
  };
}

/**
 * コンテキストのインスタンスごとの内部状態です。
 * ネイティブの `#` フィールドの代わりに `WeakMap` に保持することで、
 * 本モジュールのユーティリティー関数から内部アクセサー経由で参照できます。
 * `varsStates` 自体は外部に公開しません。
 */
type VarsState = {
  /**
   * 変数のマップです。共有ストアの参照である場合があります。
   */
  readonly data: Map<string, unknown>;

  /**
   * 読み取り専用キー集合です。共有ストアの参照である場合があります。
   */
  readonly readonlyKeys: Set<string>;
};

/**
 * インスタンスと内部状態の対応表です。
 * コンパイラーによる `#` フィールドのダウンレベルと同様に、`WeakMap` をブランド兼ストレージとして使います。
 */
export const varsStates = /*#__PURE__*/ new WeakMap<IPipelineContext, VarsState>();

function normalizeEntries(vars: VariablesInit | undefined): Iterable<readonly [string, unknown]> {
  if (vars == null) {
    return [];
  }
  if (Symbol.iterator in Object(vars)) {
    return vars as Iterable<readonly [string, unknown]>;
  }
  return Object.entries(vars as { readonly [key: string]: unknown });
}

function writeVars(data: Map<string, unknown>, vars: VariablesInit | undefined): void {
  for (const [k, v] of normalizeEntries(vars)) {
    data.set(k, v);
  }
}

function initVars(instance: IPipelineContext, vars?: VariablesInit, store?: VarsStore): void {
  if (store !== undefined) {
    // 共有ストアを参照し、下流の変更が上流に見えるようにします。
    const state: VarsState = { data: store.data, readonlyKeys: store.readonlyKeys };
    varsStates.set(instance, state);
    writeVars(state.data, vars);
    return;
  }

  const data = new Map<string, unknown>();
  writeVars(data, vars);
  varsStates.set(instance, { data, readonlyKeys: new Set<string>() });
}

function getVars(instance: IPipelineContext): VarsState {
  const state = varsStates.get(instance);
  if (state === undefined) {
    throw new TypeError("Invalid context instance.");
  }
  return state;
}

/**
 * `T` の `readonly` を外した書き込み用の型です。
 *
 * 初期値オブジェクトを組み立ててからコンストラクターに渡すときに使用します。外部からは使用しません。
 */
type Mutable<T> = {
  -readonly [K in keyof T]: T[K];
};

/**
 * 独立した複写先へ変数と読み取り専用集合を複写し、上書きを読み取り専用を迂回して適用します。
 *
 * `clone*` ユーティリティーの実装に使用します。外部からは使用しません。
 *
 * @param source 複写元です。
 * @param target 複写先です。
 * @param overrides 上書きする変数です。省略時は複写のみ行います。
 */
function copyVars(source: VarsState, target: VarsState, overrides?: VariablesInit): void {
  for (const [k, v] of source.data) {
    target.data.set(k, v);
  }
  for (const k of source.readonlyKeys) {
    target.readonlyKeys.add(k);
  }
  if (overrides != null) {
    // 読み取り専用を迂回して差し替えます。
    writeVars(target.data, overrides);
  }
}

function getVariable(instance: IPipelineContext, name: string): unknown {
  return getVars(instance).data.get(name);
}

function setVariable(instance: IPipelineContext, name: string, value: unknown): void {
  const state = getVars(instance);
  if (state.readonlyKeys.has(name)) {
    throw new ReadonlyVariableError({ name });
  }
  state.data.set(name, value);
}

function setReadonlyVariable(instance: IPipelineContext, name: string, value: unknown): void {
  const state = getVars(instance);
  if (state.readonlyKeys.has(name)) {
    throw new ReadonlyVariableError({ name });
  }
  state.data.set(name, value);
  state.readonlyKeys.add(name);
}

function createSignal(signal?: AbortSignal): AbortSignal {
  if (signal !== undefined) {
    return signal;
  }
  return new AbortController().signal;
}

function createRepair(repair?: IGetContext["repair"]): IGetContext["repair"] {
  if (repair !== undefined) {
    return repair;
  }
  return { enabled: false, targets: [] };
}

export type PipelineContextInit = {
  readonly vars?: VariablesInit | undefined;

  /**
   * 共有する変数ストアです。
   *
   * 指定したときは `vars` の複写ではなくストアの参照を共有し、下流の `set` が上流の `get` に見えます。
   * オニオン実行のネストで使用します。指定しないときは独立したストアを作成します。
   */
  readonly store?: VarsStore | undefined;
};

export class PipelineContext implements IPipelineContext {
  public constructor(init?: PipelineContextInit) {
    initVars(this, init?.vars, init?.store);
  }

  public get<const TName extends string>(name: TName): any {
    return getVariable(this, name);
  }

  public set<const TName extends string>(name: TName, value: any): this {
    setVariable(this, name, value);
    return this;
  }

  public setReadonly<const TName extends string>(name: TName, value: any): this {
    setReadonlyVariable(this, name, value);
    return this;
  }
}

export type MapKeyContextInit = {
  readonly key: string;
  readonly vars?: VariablesInit | undefined;

  /**
   * 共有する変数ストアです。
   *
   * 指定したときは `vars` の複写ではなくストアの参照を共有し、下流の `set` が上流の `get` に見えます。
   * オニオン実行のネストで使用します。指定しないときは独立したストアを作成します。
   */
  readonly store?: VarsStore | undefined;
};

export class MapKeyContext extends PipelineContext implements IMapKeyContext {
  public readonly key: string;

  public constructor(init: MapKeyContextInit) {
    super({ vars: init.vars, store: init.store });
    this.key = init.key;
  }
}

export type ActionContextInit = {
  readonly signal?: AbortSignal | undefined;
  readonly action?: IActionContext["action"] | undefined;
  readonly vars?: VariablesInit | undefined;

  /**
   * 共有する変数ストアです。
   *
   * 指定したときは `vars` の複写ではなくストアの参照を共有し、下流の `set` が上流の `get` に見えます。
   * オニオン実行のネストで使用します。指定しないときは独立したストアを作成します。
   */
  readonly store?: VarsStore | undefined;
};

export class ActionContext extends PipelineContext implements IActionContext {
  public readonly signal: AbortSignal;

  public readonly action: IActionContext["action"];

  public constructor(init?: ActionContextInit) {
    super({ vars: init?.vars, store: init?.store });
    this.signal = createSignal(init?.signal);
    this.action = init?.action ?? "set";
  }
}

export type LifecycleContextInit = {
  readonly signal?: AbortSignal | undefined;
  readonly action?: ILifecycleContext["action"] | undefined;
  readonly vars?: VariablesInit | undefined;

  /**
   * 共有する変数ストアです。
   *
   * 指定したときは `vars` の複写ではなくストアの参照を共有し、下流の `set` が上流の `get` に見えます。
   * オニオン実行のネストで使用します。指定しないときは独立したストアを作成します。
   */
  readonly store?: VarsStore | undefined;
};

export class LifecycleContext extends ActionContext implements ILifecycleContext {
  public override readonly action: ILifecycleContext["action"];

  public constructor(init?: LifecycleContextInit) {
    super({
      signal: init?.signal,
      action: init?.action ?? "open",
      vars: init?.vars,
      store: init?.store,
    });
    this.action = init?.action ?? "open";
  }
}

export type OpenContextInit = {
  readonly signal?: AbortSignal | undefined;
  readonly action?: "open" | undefined;
  readonly vars?: VariablesInit | undefined;

  /**
   * 共有する変数ストアです。
   *
   * 指定したときは `vars` の複写ではなくストアの参照を共有し、下流の `set` が上流の `get` に見えます。
   * オニオン実行のネストで使用します。指定しないときは独立したストアを作成します。
   */
  readonly store?: VarsStore | undefined;
};

export class OpenContext extends LifecycleContext implements IOpenContext {
  public override readonly action: "open";

  public constructor(init?: OpenContextInit) {
    super({ signal: init?.signal, action: "open", vars: init?.vars, store: init?.store });
    this.action = "open";
  }
}

export type CloseContextInit = {
  readonly signal?: AbortSignal | undefined;
  readonly action?: "close" | undefined;
  readonly vars?: VariablesInit | undefined;

  /**
   * 共有する変数ストアです。
   *
   * 指定したときは `vars` の複写ではなくストアの参照を共有し、下流の `set` が上流の `get` に見えます。
   * オニオン実行のネストで使用します。指定しないときは独立したストアを作成します。
   */
  readonly store?: VarsStore | undefined;
};

export class CloseContext extends LifecycleContext implements ICloseContext {
  public override readonly action: "close";

  public constructor(init?: CloseContextInit) {
    super({ signal: init?.signal, action: "close", vars: init?.vars, store: init?.store });
    this.action = "close";
  }
}

export type KeyedActionContextInit = {
  readonly signal?: AbortSignal | undefined;
  readonly action?: IKeyedActionContext["action"] | undefined;
  readonly key: string;
  readonly vars?: VariablesInit | undefined;

  /**
   * 共有する変数ストアです。
   *
   * 指定したときは `vars` の複写ではなくストアの参照を共有し、下流の `set` が上流の `get` に見えます。
   * オニオン実行のネストで使用します。指定しないときは独立したストアを作成します。
   */
  readonly store?: VarsStore | undefined;
};

export class KeyedActionContext extends ActionContext implements IKeyedActionContext {
  public override readonly action: IKeyedActionContext["action"];

  public readonly key: string;

  public constructor(init: KeyedActionContextInit) {
    super({
      signal: init.signal,
      action: init.action ?? "set",
      vars: init.vars,
      store: init.store,
    });
    this.action = init.action ?? "set";
    this.key = init.key;
  }
}

export type SetContextInit = {
  readonly signal?: AbortSignal | undefined;
  readonly action?: "set" | undefined;
  readonly key: string;
  readonly vars?: VariablesInit | undefined;

  /**
   * 共有する変数ストアです。
   *
   * 指定したときは `vars` の複写ではなくストアの参照を共有し、下流の `set` が上流の `get` に見えます。
   * オニオン実行のネストで使用します。指定しないときは独立したストアを作成します。
   */
  readonly store?: VarsStore | undefined;
};

export class SetContext extends KeyedActionContext implements ISetContext {
  public override readonly action: "set";

  public constructor(init: SetContextInit) {
    super({
      signal: init.signal,
      action: "set",
      key: init.key,
      vars: init.vars,
      store: init.store,
    });
    this.action = "set";
  }
}

export type GetContextInit = {
  readonly signal?: AbortSignal | undefined;
  readonly action?: "get" | undefined;
  readonly key: string;
  readonly repair?: IGetContext["repair"] | undefined;
  readonly vars?: VariablesInit | undefined;

  /**
   * 共有する変数ストアです。
   *
   * 指定したときは `vars` の複写ではなくストアの参照を共有し、下流の `set` が上流の `get` に見えます。
   * オニオン実行のネストで使用します。指定しないときは独立したストアを作成します。
   */
  readonly store?: VarsStore | undefined;
};

export class GetContext extends KeyedActionContext implements IGetContext {
  public override readonly action: "get";

  public readonly repair: IGetContext["repair"];

  public constructor(init: GetContextInit) {
    super({
      signal: init.signal,
      action: "get",
      key: init.key,
      vars: init.vars,
      store: init.store,
    });
    this.action = "get";
    this.repair = createRepair(init.repair);
  }
}

export type StreamContextInit = {
  readonly signal?: AbortSignal | undefined;
  readonly action?: "stream" | undefined;
  readonly key: string;
  readonly repair?: IStreamContext["repair"] | undefined;
  readonly vars?: VariablesInit | undefined;

  /**
   * 共有する変数ストアです。
   *
   * 指定したときは `vars` の複写ではなくストアの参照を共有し、下流の `set` が上流の `get` に見えます。
   * オニオン実行のネストで使用します。指定しないときは独立したストアを作成します。
   */
  readonly store?: VarsStore | undefined;
};

export class StreamContext extends KeyedActionContext implements IStreamContext {
  public override readonly action: "stream";

  public readonly repair: IStreamContext["repair"];

  public constructor(init: StreamContextInit) {
    super({
      signal: init.signal,
      action: "stream",
      key: init.key,
      vars: init.vars,
      store: init.store,
    });
    this.action = "stream";
    this.repair = createRepair(init.repair);
  }
}

export type HasContextInit = {
  readonly signal?: AbortSignal | undefined;
  readonly action?: "has" | undefined;
  readonly key: string;
  readonly vars?: VariablesInit | undefined;

  /**
   * 共有する変数ストアです。
   *
   * 指定したときは `vars` の複写ではなくストアの参照を共有し、下流の `set` が上流の `get` に見えます。
   * オニオン実行のネストで使用します。指定しないときは独立したストアを作成します。
   */
  readonly store?: VarsStore | undefined;
};

export class HasContext extends KeyedActionContext implements IHasContext {
  public override readonly action: "has";

  public constructor(init: HasContextInit) {
    super({
      signal: init.signal,
      action: "has",
      key: init.key,
      vars: init.vars,
      store: init.store,
    });
    this.action = "has";
  }
}

export type DeleteContextInit = {
  readonly signal?: AbortSignal | undefined;
  readonly action?: "delete" | undefined;
  readonly key: string;
  readonly vars?: VariablesInit | undefined;

  /**
   * 共有する変数ストアです。
   *
   * 指定したときは `vars` の複写ではなくストアの参照を共有し、下流の `set` が上流の `get` に見えます。
   * オニオン実行のネストで使用します。指定しないときは独立したストアを作成します。
   */
  readonly store?: VarsStore | undefined;
};

export class DeleteContext extends KeyedActionContext implements IDeleteContext {
  public override readonly action: "delete";

  public constructor(init: DeleteContextInit) {
    super({
      signal: init.signal,
      action: "delete",
      key: init.key,
      vars: init.vars,
      store: init.store,
    });
    this.action = "delete";
  }
}

export type ClearContextInit = {
  readonly signal?: AbortSignal | undefined;
  readonly action?: "clear" | undefined;
  readonly key: string;
  readonly vars?: VariablesInit | undefined;

  /**
   * 共有する変数ストアです。
   *
   * 指定したときは `vars` の複写ではなくストアの参照を共有し、下流の `set` が上流の `get` に見えます。
   * オニオン実行のネストで使用します。指定しないときは独立したストアを作成します。
   */
  readonly store?: VarsStore | undefined;
};

export class ClearContext extends KeyedActionContext implements IClearContext {
  public override readonly action: "clear";

  public constructor(init: ClearContextInit) {
    super({
      signal: init.signal,
      action: "clear",
      key: init.key,
      vars: init.vars,
      store: init.store,
    });
    this.action = "clear";
  }
}

export type TransformContextInit<TSource = any, TDestination = TSource> = {
  readonly signal?: AbortSignal | undefined;
  readonly action?: ITransformContext["action"] | undefined;
  readonly key: string;
  readonly source?: TSource | undefined;
  readonly destination?: TDestination | undefined;
  readonly vars?: VariablesInit | undefined;

  /**
   * 共有する変数ストアです。
   *
   * 指定したときは `vars` の複写ではなくストアの参照を共有し、下流の `set` が上流の `get` に見えます。
   * オニオン実行のネストで使用します。指定しないときは独立したストアを作成します。
   */
  readonly store?: VarsStore | undefined;
};

export class TransformContext<TSource = any, TDestination = TSource>
  extends KeyedActionContext
  implements ITransformContext<TSource, TDestination>
{
  public override readonly action: ITransformContext["action"];

  public readonly source: TSource;

  public destination?: TDestination;

  public constructor(init: TransformContextInit<TSource, TDestination>) {
    super({
      signal: init.signal,
      action: init.action ?? "set",
      key: init.key,
      vars: init.vars,
      store: init.store,
    });
    this.action = init.action ?? "set";
    this.source = init.source as TSource;
    if ("destination" in init) {
      this.destination = init.destination as any;
    } else {
      delete this.destination;
    }
  }
}

export type TransformDataContextInit<TSourceData = any, TDestinationData = TSourceData> = {
  readonly signal?: AbortSignal | undefined;
  readonly action?: ITransformDataContext["action"] | undefined;
  readonly key: string;
  readonly source?: TSourceData | undefined;
  readonly destination?: TDestinationData | undefined;
  readonly vars?: VariablesInit | undefined;

  /**
   * 共有する変数ストアです。
   *
   * 指定したときは `vars` の複写ではなくストアの参照を共有し、下流の `set` が上流の `get` に見えます。
   * オニオン実行のネストで使用します。指定しないときは独立したストアを作成します。
   */
  readonly store?: VarsStore | undefined;
};

export class TransformDataContext<TSourceData = any, TDestinationData = TSourceData>
  extends TransformContext<TSourceData, TDestinationData>
  implements ITransformDataContext<TSourceData, TDestinationData>
{
  public override readonly action: ITransformDataContext["action"];

  public constructor(init: TransformDataContextInit<TSourceData, TDestinationData>) {
    super({
      signal: init.signal,
      action: init.action ?? "set",
      key: init.key,
      source: init.source,
      vars: init.vars,
      store: init.store,
    });
    this.action = init.action ?? "set";
    if ("destination" in init) {
      this.destination = init.destination as any;
    } else {
      delete this.destination;
    }
  }
}

export type EncodeContextInit<TRawData = any, TEncodedData = TRawData> = {
  readonly signal?: AbortSignal | undefined;
  readonly action?: "set" | undefined;
  readonly key: string;
  readonly source?: TRawData | undefined;
  readonly destination?: TEncodedData | undefined;
  readonly vars?: VariablesInit | undefined;

  /**
   * 共有する変数ストアです。
   *
   * 指定したときは `vars` の複写ではなくストアの参照を共有し、下流の `set` が上流の `get` に見えます。
   * オニオン実行のネストで使用します。指定しないときは独立したストアを作成します。
   */
  readonly store?: VarsStore | undefined;
};

export class EncodeContext<TRawData = any, TEncodedData = TRawData>
  extends TransformDataContext<TRawData, TEncodedData>
  implements IEncodeContext<TRawData, TEncodedData>
{
  public override readonly action: "set";

  public constructor(init: EncodeContextInit<TRawData, TEncodedData>) {
    super({
      signal: init.signal,
      action: "set",
      key: init.key,
      source: init.source,
      vars: init.vars,
      store: init.store,
    });
    this.action = "set";
    if ("destination" in init) {
      this.destination = init.destination as any;
    } else {
      delete this.destination;
    }
  }
}

export type DecodeContextInit<TRawData = any, TDecodedData = TRawData> = {
  readonly signal?: AbortSignal | undefined;
  readonly action?: "get" | undefined;
  readonly key: string;
  readonly source?: TRawData | undefined;
  readonly destination?: TDecodedData | undefined;
  readonly vars?: VariablesInit | undefined;

  /**
   * 共有する変数ストアです。
   *
   * 指定したときは `vars` の複写ではなくストアの参照を共有し、下流の `set` が上流の `get` に見えます。
   * オニオン実行のネストで使用します。指定しないときは独立したストアを作成します。
   */
  readonly store?: VarsStore | undefined;
};

export class DecodeContext<TRawData = any, TDecodedData = TRawData>
  extends TransformDataContext<TRawData, TDecodedData>
  implements IDecodeContext<TRawData, TDecodedData>
{
  public override readonly action: "get";

  public constructor(init: DecodeContextInit<TRawData, TDecodedData>) {
    super({
      signal: init.signal,
      action: "get",
      key: init.key,
      source: init.source,
      vars: init.vars,
      store: init.store,
    });
    this.action = "get";
    if ("destination" in init) {
      this.destination = init.destination as any;
    } else {
      delete this.destination;
    }
  }
}

export type TransformStreamContextInit<TSourceChunk = any, TDestinationChunk = TSourceChunk> = {
  readonly signal?: AbortSignal | undefined;
  readonly action?: ITransformStreamContext["action"] | undefined;
  readonly key: string;
  readonly source?: IReadableStream<TSourceChunk> | undefined;
  readonly destination?: IReadableStream<TDestinationChunk> | undefined;
  readonly vars?: VariablesInit | undefined;

  /**
   * 共有する変数ストアです。
   *
   * 指定したときは `vars` の複写ではなくストアの参照を共有し、下流の `set` が上流の `get` に見えます。
   * オニオン実行のネストで使用します。指定しないときは独立したストアを作成します。
   */
  readonly store?: VarsStore | undefined;
};

export class TransformStreamContext<TSourceChunk = any, TDestinationChunk = TSourceChunk>
  extends TransformContext<IReadableStream<TSourceChunk>, IReadableStream<TDestinationChunk>>
  implements ITransformStreamContext<TSourceChunk, TDestinationChunk>
{
  public override readonly action: ITransformStreamContext["action"];

  public constructor(init: TransformStreamContextInit<TSourceChunk, TDestinationChunk>) {
    super({
      signal: init.signal,
      action: init.action ?? "set",
      key: init.key,
      source: init.source,
      vars: init.vars,
      store: init.store,
    });
    this.action = init.action ?? "set";
    if ("destination" in init) {
      this.destination = init.destination as any;
    } else {
      delete this.destination;
    }
  }
}

export type EncodeStreamContextInit<TRawChunk = any, TEncodedChunk = TRawChunk> = {
  readonly signal?: AbortSignal | undefined;
  readonly action?: "set" | undefined;
  readonly key: string;
  readonly source?: IReadableStream<TRawChunk> | undefined;
  readonly destination?: IReadableStream<TEncodedChunk> | undefined;
  readonly vars?: VariablesInit | undefined;

  /**
   * 共有する変数ストアです。
   *
   * 指定したときは `vars` の複写ではなくストアの参照を共有し、下流の `set` が上流の `get` に見えます。
   * オニオン実行のネストで使用します。指定しないときは独立したストアを作成します。
   */
  readonly store?: VarsStore | undefined;
};

export class EncodeStreamContext<TRawChunk = any, TEncodedChunk = TRawChunk>
  extends TransformStreamContext<TRawChunk, TEncodedChunk>
  implements IEncodeStreamContext<TRawChunk, TEncodedChunk>
{
  public override readonly action: "set";

  public constructor(init: EncodeStreamContextInit<TRawChunk, TEncodedChunk>) {
    super({
      signal: init.signal,
      action: "set",
      key: init.key,
      source: init.source,
      vars: init.vars,
      store: init.store,
    });
    this.action = "set";
    if ("destination" in init) {
      this.destination = init.destination as any;
    } else {
      delete this.destination;
    }
  }
}

export type DecodeStreamContextInit<TRawChunk = any, TDecodedChunk = TRawChunk> = {
  readonly signal?: AbortSignal | undefined;
  readonly action?: "stream" | undefined;
  readonly key: string;
  readonly source?: IReadableStream<TRawChunk> | undefined;
  readonly destination?: IReadableStream<TDecodedChunk> | undefined;
  readonly vars?: VariablesInit | undefined;

  /**
   * 共有する変数ストアです。
   *
   * 指定したときは `vars` の複写ではなくストアの参照を共有し、下流の `set` が上流の `get` に見えます。
   * オニオン実行のネストで使用します。指定しないときは独立したストアを作成します。
   */
  readonly store?: VarsStore | undefined;
};

export class DecodeStreamContext<TRawChunk = any, TDecodedChunk = TRawChunk>
  extends TransformStreamContext<TRawChunk, TDecodedChunk>
  implements IDecodeStreamContext<TRawChunk, TDecodedChunk>
{
  public override readonly action: "stream";

  public constructor(init: DecodeStreamContextInit<TRawChunk, TDecodedChunk>) {
    super({
      signal: init.signal,
      action: "stream",
      key: init.key,
      source: init.source,
      vars: init.vars,
      store: init.store,
    });
    this.action = "stream";
    if ("destination" in init) {
      this.destination = init.destination as any;
    } else {
      delete this.destination;
    }
  }
}

// -------------------------------------------------------------------------------------------------
//
// ユーティリティー
//
// クラスにはインターフェイスで公開されているプロパティー・メソッド以外を公開しないため、
// 変数ストアの参照・列挙・派生・複製は以下の関数で行います。
// 内部状態へのアクセスは `varsStates` 経由です。
//
// -------------------------------------------------------------------------------------------------

/**
 * 共有している変数ストアを返します。
 *
 * 派生コンテキストの作成に使用します。返される `data`/`readonlyKeys` は共有参照です。
 *
 * @param context 対象のコンテキストです。
 * @returns 変数ストアを返します。
 */
export function getVarsStore(context: IPipelineContext): VarsStore {
  const state = getVars(context);
  return { data: state.data, readonlyKeys: state.readonlyKeys };
}

/**
 * 保持する変数のエントリー列を返します。
 *
 * @param context 対象のコンテキストです。
 * @returns 変数のエントリー列を返します。
 */
export function getVarsEntries(context: IPipelineContext): IterableIterator<[string, unknown]> {
  return getVars(context).data.entries();
}

/**
 * 同一ストアを共有する派生コンテキストを作成します。
 *
 * 変数マップは共有されるため、下流の `set` が上流の `get` に見えます。
 * オニオン実行のネストで使用します。
 *
 * @param context 派生元のコンテキストです。
 * @param init 上書きするフィールドです。`vars` を指定したときは共有ストアに追記されます。
 * @returns 派生したコンテキストを返します。
 */
export function derivePipelineContext(
  context: PipelineContext,
  init: Omit<PipelineContextInit, "store" | "vars"> & {
    readonly vars?: VariablesInit | undefined;
  } = {},
): PipelineContext {
  return new PipelineContext({ vars: init.vars, store: getVarsStore(context) });
}

/**
 * 変数マップを複製した新しいコンテキストを作成します。
 *
 * 変数と読み取り専用集合だけを複写します。
 * 上書きが指定されたときは、読み取り専用を迂回して差し替えます。
 *
 * @param context 複写元のコンテキストです。
 * @param overrides 上書きする変数です。省略時は複写のみ行います。
 * @returns 複製したコンテキストを返します。
 */
export function clonePipelineContext(
  context: PipelineContext,
  overrides?: VariablesInit,
): PipelineContext {
  const cloned = new PipelineContext();
  copyVars(getVars(context), getVars(cloned), overrides);
  return cloned;
}

/**
 * 同一ストアを共有する派生コンテキストを作成します。
 *
 * `key` は上書きでき、変数マップは共有されるため、下流の `set` が上流の `get` に見えます。
 *
 * @param context 派生元のコンテキストです。
 * @param init 上書きするフィールドです。`vars` を指定したときは共有ストアに追記されます。
 * @returns 派生したコンテキストを返します。
 */
export function deriveMapKeyContext(
  context: MapKeyContext,
  init: Omit<MapKeyContextInit, "store" | "vars" | "key"> & {
    readonly key?: string | undefined;
    readonly vars?: VariablesInit | undefined;
  } = {},
): MapKeyContext {
  return new MapKeyContext({
    key: init.key ?? context.key,
    vars: init.vars,
    store: getVarsStore(context),
  });
}

/**
 * 変数マップを複製した新しいコンテキストを作成します。
 *
 * `key` は引き継ぎ、変数と読み取り専用集合だけを複写します。
 * 上書きが指定されたときは、読み取り専用を迂回して差し替えます。
 *
 * @param context 複写元のコンテキストです。
 * @param overrides 上書きする変数です。省略時は複写のみ行います。
 * @returns 複製したコンテキストを返します。
 */
export function cloneMapKeyContext(
  context: MapKeyContext,
  overrides?: VariablesInit,
): MapKeyContext {
  const cloned = new MapKeyContext({ key: context.key });
  copyVars(getVars(context), getVars(cloned), overrides);
  return cloned;
}

/**
 * 同一ストアを共有する派生コンテキストを作成します。
 *
 * `signal`/`action` は上書きでき、変数マップは共有されるため、下流の `set` が上流の `get` に見えます。
 *
 * @param context 派生元のコンテキストです。
 * @param init 上書きするフィールドです。`vars` を指定したときは共有ストアに追記されます。
 * @returns 派生したコンテキストを返します。
 */
export function deriveActionContext(
  context: ActionContext,
  init: Omit<ActionContextInit, "store" | "vars"> & {
    readonly vars?: VariablesInit | undefined;
  } = {},
): ActionContext {
  return new ActionContext({
    signal: init.signal ?? context.signal,
    action: init.action ?? context.action,
    vars: init.vars,
    store: getVarsStore(context),
  });
}

/**
 * 変数マップを複製した新しいコンテキストを作成します。
 *
 * `signal`/`action` は引き継ぎ、変数と読み取り専用集合だけを複写します。
 * 上書きが指定されたときは、読み取り専用を迂回して差し替えます。
 *
 * @param context 複写元のコンテキストです。
 * @param overrides 上書きする変数です。省略時は複写のみ行います。
 * @returns 複製したコンテキストを返します。
 */
export function cloneActionContext(
  context: ActionContext,
  overrides?: VariablesInit,
): ActionContext {
  const cloned = new ActionContext({ signal: context.signal, action: context.action });
  copyVars(getVars(context), getVars(cloned), overrides);
  return cloned;
}

/**
 * 同一ストアを共有する派生コンテキストを作成します。
 *
 * `signal`/`action` は上書きでき、変数マップは共有されるため、下流の `set` が上流の `get` に見えます。
 *
 * @param context 派生元のコンテキストです。
 * @param init 上書きするフィールドです。`vars` を指定したときは共有ストアに追記されます。
 * @returns 派生したコンテキストを返します。
 */
export function deriveLifecycleContext(
  context: LifecycleContext,
  init: Omit<LifecycleContextInit, "store" | "vars"> & {
    readonly vars?: VariablesInit | undefined;
  } = {},
): LifecycleContext {
  return new LifecycleContext({
    signal: init.signal ?? context.signal,
    action: init.action ?? context.action,
    vars: init.vars,
    store: getVarsStore(context),
  });
}

/**
 * 変数マップを複製した新しいコンテキストを作成します。
 *
 * `signal`/`action` は引き継ぎ、変数と読み取り専用集合だけを複写します。
 * 上書きが指定されたときは、読み取り専用を迂回して差し替えます。
 *
 * @param context 複写元のコンテキストです。
 * @param overrides 上書きする変数です。省略時は複写のみ行います。
 * @returns 複製したコンテキストを返します。
 */
export function cloneLifecycleContext(
  context: LifecycleContext,
  overrides?: VariablesInit,
): LifecycleContext {
  const cloned = new LifecycleContext({ signal: context.signal, action: context.action });
  copyVars(getVars(context), getVars(cloned), overrides);
  return cloned;
}

/**
 * 同一ストアを共有する派生コンテキストを作成します。
 *
 * `signal` は上書きでき、変数マップは共有されるため、下流の `set` が上流の `get` に見えます。
 *
 * @param context 派生元のコンテキストです。
 * @param init 上書きするフィールドです。`vars` を指定したときは共有ストアに追記されます。
 * @returns 派生したコンテキストを返します。
 */
export function deriveOpenContext(
  context: OpenContext,
  init: Omit<OpenContextInit, "store" | "vars" | "action"> & {
    readonly vars?: VariablesInit | undefined;
  } = {},
): OpenContext {
  return new OpenContext({
    signal: init.signal ?? context.signal,
    vars: init.vars,
    store: getVarsStore(context),
  });
}

/**
 * 変数マップを複製した新しいコンテキストを作成します。
 *
 * `signal` は引き継ぎ、変数と読み取り専用集合だけを複写します。
 * 上書きが指定されたときは、読み取り専用を迂回して差し替えます。
 *
 * @param context 複写元のコンテキストです。
 * @param overrides 上書きする変数です。省略時は複写のみ行います。
 * @returns 複製したコンテキストを返します。
 */
export function cloneOpenContext(context: OpenContext, overrides?: VariablesInit): OpenContext {
  const cloned = new OpenContext({ signal: context.signal });
  copyVars(getVars(context), getVars(cloned), overrides);
  return cloned;
}

/**
 * 同一ストアを共有する派生コンテキストを作成します。
 *
 * `signal` は上書きでき、変数マップは共有されるため、下流の `set` が上流の `get` に見えます。
 *
 * @param context 派生元のコンテキストです。
 * @param init 上書きするフィールドです。`vars` を指定したときは共有ストアに追記されます。
 * @returns 派生したコンテキストを返します。
 */
export function deriveCloseContext(
  context: CloseContext,
  init: Omit<CloseContextInit, "store" | "vars" | "action"> & {
    readonly vars?: VariablesInit | undefined;
  } = {},
): CloseContext {
  return new CloseContext({
    signal: init.signal ?? context.signal,
    vars: init.vars,
    store: getVarsStore(context),
  });
}

/**
 * 変数マップを複製した新しいコンテキストを作成します。
 *
 * `signal` は引き継ぎ、変数と読み取り専用集合だけを複写します。
 * 上書きが指定されたときは、読み取り専用を迂回して差し替えます。
 *
 * @param context 複写元のコンテキストです。
 * @param overrides 上書きする変数です。省略時は複写のみ行います。
 * @returns 複製したコンテキストを返します。
 */
export function cloneCloseContext(context: CloseContext, overrides?: VariablesInit): CloseContext {
  const cloned = new CloseContext({ signal: context.signal });
  copyVars(getVars(context), getVars(cloned), overrides);
  return cloned;
}

/**
 * 同一ストアを共有する派生コンテキストを作成します。
 *
 * `signal`/`action`/`key` は上書きでき、変数マップは共有されるため、下流の `set` が上流の `get` に見えます。
 * オニオン実行のネストで使用します。
 *
 * @param context 派生元のコンテキストです。
 * @param init 上書きするフィールドです。`vars` を指定したときは共有ストアに追記されます。
 * @returns 派生したコンテキストを返します。
 */
export function deriveKeyedActionContext(
  context: KeyedActionContext,
  init: Omit<KeyedActionContextInit, "store" | "vars" | "key"> & {
    readonly key?: string | undefined;
    readonly vars?: VariablesInit | undefined;
  } = {},
): KeyedActionContext {
  return new KeyedActionContext({
    signal: init.signal ?? context.signal,
    action: init.action ?? context.action,
    key: init.key ?? context.key,
    vars: init.vars,
    store: getVarsStore(context),
  });
}

/**
 * 変数マップを複製した新しいコンテキストを作成します。
 *
 * `signal`/`action`/`key` は引き継ぎ、変数と読み取り専用集合だけを複写します。
 * 上書きが指定されたときは、読み取り専用を迂回して差し替えます。
 *
 * @param context 複写元のコンテキストです。
 * @param overrides 上書きする変数です。省略時は複写のみ行います。
 * @returns 複製したコンテキストを返します。
 */
export function cloneKeyedActionContext(
  context: KeyedActionContext,
  overrides?: VariablesInit,
): KeyedActionContext {
  const cloned = new KeyedActionContext({
    signal: context.signal,
    action: context.action,
    key: context.key,
  });
  copyVars(getVars(context), getVars(cloned), overrides);
  return cloned;
}

/**
 * 同一ストアを共有する派生コンテキストを作成します。
 *
 * `signal`/`key` は上書きでき、変数マップは共有されるため、下流の `set` が上流の `get` に見えます。
 *
 * @param context 派生元のコンテキストです。
 * @param init 上書きするフィールドです。`vars` を指定したときは共有ストアに追記されます。
 * @returns 派生したコンテキストを返します。
 */
export function deriveSetContext(
  context: SetContext,
  init: Omit<SetContextInit, "store" | "vars" | "action" | "key"> & {
    readonly key?: string | undefined;
    readonly vars?: VariablesInit | undefined;
  } = {},
): SetContext {
  return new SetContext({
    signal: init.signal ?? context.signal,
    key: init.key ?? context.key,
    vars: init.vars,
    store: getVarsStore(context),
  });
}

/**
 * 変数マップを複製した新しいコンテキストを作成します。
 *
 * `signal`/`key` は引き継ぎ、変数と読み取り専用集合だけを複写します。
 * 上書きが指定されたときは、読み取り専用を迂回して差し替えます。
 *
 * @param context 複写元のコンテキストです。
 * @param overrides 上書きする変数です。省略時は複写のみ行います。
 * @returns 複製したコンテキストを返します。
 */
export function cloneSetContext(context: SetContext, overrides?: VariablesInit): SetContext {
  const cloned = new SetContext({ signal: context.signal, key: context.key });
  copyVars(getVars(context), getVars(cloned), overrides);
  return cloned;
}

/**
 * 同一ストアを共有する派生コンテキストを作成します。
 *
 * `signal`/`key`/`repair` は上書きでき、変数マップは共有されるため、下流の `set` が上流の `get` に見えます。
 *
 * @param context 派生元のコンテキストです。
 * @param init 上書きするフィールドです。`vars` を指定したときは共有ストアに追記されます。
 * @returns 派生したコンテキストを返します。
 */
export function deriveGetContext(
  context: GetContext,
  init: Omit<GetContextInit, "store" | "vars" | "action" | "key"> & {
    readonly key?: string | undefined;
    readonly vars?: VariablesInit | undefined;
  } = {},
): GetContext {
  return new GetContext({
    signal: init.signal ?? context.signal,
    key: init.key ?? context.key,
    repair: init.repair ?? context.repair,
    vars: init.vars,
    store: getVarsStore(context),
  });
}

/**
 * 変数マップを複製した新しいコンテキストを作成します。
 *
 * `signal`/`key`/`repair` は引き継ぎ、変数と読み取り専用集合だけを複写します。
 * 上書きが指定されたときは、読み取り専用を迂回して差し替えます。
 *
 * @param context 複写元のコンテキストです。
 * @param overrides 上書きする変数です。省略時は複写のみ行います。
 * @returns 複製したコンテキストを返します。
 */
export function cloneGetContext(context: GetContext, overrides?: VariablesInit): GetContext {
  const cloned = new GetContext({
    signal: context.signal,
    key: context.key,
    repair: context.repair,
  });
  copyVars(getVars(context), getVars(cloned), overrides);
  return cloned;
}

/**
 * 同一ストアを共有する派生コンテキストを作成します。
 *
 * `signal`/`key`/`repair` は上書きでき、変数マップは共有されるため、下流の `set` が上流の `get` に見えます。
 *
 * @param context 派生元のコンテキストです。
 * @param init 上書きするフィールドです。`vars` を指定したときは共有ストアに追記されます。
 * @returns 派生したコンテキストを返します。
 */
export function deriveStreamContext(
  context: StreamContext,
  init: Omit<StreamContextInit, "store" | "vars" | "action" | "key"> & {
    readonly key?: string | undefined;
    readonly vars?: VariablesInit | undefined;
  } = {},
): StreamContext {
  return new StreamContext({
    signal: init.signal ?? context.signal,
    key: init.key ?? context.key,
    repair: init.repair ?? context.repair,
    vars: init.vars,
    store: getVarsStore(context),
  });
}

/**
 * 変数マップを複製した新しいコンテキストを作成します。
 *
 * `signal`/`key`/`repair` は引き継ぎ、変数と読み取り専用集合だけを複写します。
 * 上書きが指定されたときは、読み取り専用を迂回して差し替えます。
 *
 * @param context 複写元のコンテキストです。
 * @param overrides 上書きする変数です。省略時は複写のみ行います。
 * @returns 複製したコンテキストを返します。
 */
export function cloneStreamContext(
  context: StreamContext,
  overrides?: VariablesInit,
): StreamContext {
  const cloned = new StreamContext({
    signal: context.signal,
    key: context.key,
    repair: context.repair,
  });
  copyVars(getVars(context), getVars(cloned), overrides);
  return cloned;
}

/**
 * 同一ストアを共有する派生コンテキストを作成します。
 *
 * `signal`/`key` は上書きでき、変数マップは共有されるため、下流の `set` が上流の `get` に見えます。
 *
 * @param context 派生元のコンテキストです。
 * @param init 上書きするフィールドです。`vars` を指定したときは共有ストアに追記されます。
 * @returns 派生したコンテキストを返します。
 */
export function deriveHasContext(
  context: HasContext,
  init: Omit<HasContextInit, "store" | "vars" | "action" | "key"> & {
    readonly key?: string | undefined;
    readonly vars?: VariablesInit | undefined;
  } = {},
): HasContext {
  return new HasContext({
    signal: init.signal ?? context.signal,
    key: init.key ?? context.key,
    vars: init.vars,
    store: getVarsStore(context),
  });
}

/**
 * 変数マップを複製した新しいコンテキストを作成します。
 *
 * `signal`/`key` は引き継ぎ、変数と読み取り専用集合だけを複写します。
 * 上書きが指定されたときは、読み取り専用を迂回して差し替えます。
 *
 * @param context 複写元のコンテキストです。
 * @param overrides 上書きする変数です。省略時は複写のみ行います。
 * @returns 複製したコンテキストを返します。
 */
export function cloneHasContext(context: HasContext, overrides?: VariablesInit): HasContext {
  const cloned = new HasContext({ signal: context.signal, key: context.key });
  copyVars(getVars(context), getVars(cloned), overrides);
  return cloned;
}

/**
 * 同一ストアを共有する派生コンテキストを作成します。
 *
 * `signal`/`key` は上書きでき、変数マップは共有されるため、下流の `set` が上流の `get` に見えます。
 *
 * @param context 派生元のコンテキストです。
 * @param init 上書きするフィールドです。`vars` を指定したときは共有ストアに追記されます。
 * @returns 派生したコンテキストを返します。
 */
export function deriveDeleteContext(
  context: DeleteContext,
  init: Omit<DeleteContextInit, "store" | "vars" | "action" | "key"> & {
    readonly key?: string | undefined;
    readonly vars?: VariablesInit | undefined;
  } = {},
): DeleteContext {
  return new DeleteContext({
    signal: init.signal ?? context.signal,
    key: init.key ?? context.key,
    vars: init.vars,
    store: getVarsStore(context),
  });
}

/**
 * 変数マップを複製した新しいコンテキストを作成します。
 *
 * `signal`/`key` は引き継ぎ、変数と読み取り専用集合だけを複写します。
 * 上書きが指定されたときは、読み取り専用を迂回して差し替えます。
 *
 * @param context 複写元のコンテキストです。
 * @param overrides 上書きする変数です。省略時は複写のみ行います。
 * @returns 複製したコンテキストを返します。
 */
export function cloneDeleteContext(
  context: DeleteContext,
  overrides?: VariablesInit,
): DeleteContext {
  const cloned = new DeleteContext({ signal: context.signal, key: context.key });
  copyVars(getVars(context), getVars(cloned), overrides);
  return cloned;
}

/**
 * 同一ストアを共有する派生コンテキストを作成します。
 *
 * `signal`/`key` は上書きでき、変数マップは共有されるため、下流の `set` が上流の `get` に見えます。
 *
 * @param context 派生元のコンテキストです。
 * @param init 上書きするフィールドです。`vars` を指定したときは共有ストアに追記されます。
 * @returns 派生したコンテキストを返します。
 */
export function deriveClearContext(
  context: ClearContext,
  init: Omit<ClearContextInit, "store" | "vars" | "action" | "key"> & {
    readonly key?: string | undefined;
    readonly vars?: VariablesInit | undefined;
  } = {},
): ClearContext {
  return new ClearContext({
    signal: init.signal ?? context.signal,
    key: init.key ?? context.key,
    vars: init.vars,
    store: getVarsStore(context),
  });
}

/**
 * 変数マップを複製した新しいコンテキストを作成します。
 *
 * `signal`/`key` は引き継ぎ、変数と読み取り専用集合だけを複写します。
 * 上書きが指定されたときは、読み取り専用を迂回して差し替えます。
 *
 * @param context 複写元のコンテキストです。
 * @param overrides 上書きする変数です。省略時は複写のみ行います。
 * @returns 複製したコンテキストを返します。
 */
export function cloneClearContext(context: ClearContext, overrides?: VariablesInit): ClearContext {
  const cloned = new ClearContext({ signal: context.signal, key: context.key });
  copyVars(getVars(context), getVars(cloned), overrides);
  return cloned;
}

/**
 * 同一ストアを共有する派生コンテキストを作成します。
 *
 * `signal`/`action`/`key`/`source`/`destination` は上書きでき、変数マップは共有されるため、
 * 下流の `set` が上流の `get` に見えます。`source`/`destination` は存在の有無で引き継ぐため、
 * 明示的な `undefined` で上書きできます。
 *
 * @param context 派生元のコンテキストです。
 * @param init 上書きするフィールドです。`vars` を指定したときは共有ストアに追記されます。
 * @returns 派生したコンテキストを返します。
 */
export function deriveTransformContext<TSource = any, TDestination = TSource>(
  context: TransformContext<TSource, TDestination>,
  init: Omit<TransformContextInit<TSource, TDestination>, "store" | "vars" | "key"> & {
    readonly key?: string | undefined;
    readonly vars?: VariablesInit | undefined;
  } = {},
): TransformContext<TSource, TDestination> {
  const derivedInit: Mutable<TransformContextInit<TSource, TDestination>> = {
    signal: init.signal ?? context.signal,
    action: init.action ?? context.action,
    key: init.key ?? context.key,
    source: "source" in init ? init.source : context.source,
    vars: init.vars,
    store: getVarsStore(context),
  };
  if ("destination" in init) {
    derivedInit.destination = init.destination;
  } else if ("destination" in context) {
    derivedInit.destination = context.destination;
  }
  return new TransformContext<TSource, TDestination>(derivedInit);
}

/**
 * 変数マップを複製した新しいコンテキストを作成します。
 *
 * `signal`/`action`/`key`/`source`/`destination` は引き継ぎ、変数と読み取り専用集合だけを複写します。
 * 上書きが指定されたときは、読み取り専用を迂回して差し替えます。
 *
 * @param context 複写元のコンテキストです。
 * @param overrides 上書きする変数です。省略時は複写のみ行います。
 * @returns 複製したコンテキストを返します。
 */
export function cloneTransformContext<TSource = any, TDestination = TSource>(
  context: TransformContext<TSource, TDestination>,
  overrides?: VariablesInit,
): TransformContext<TSource, TDestination> {
  const clonedInit: Mutable<TransformContextInit<TSource, TDestination>> = {
    signal: context.signal,
    action: context.action,
    key: context.key,
    source: context.source,
  };
  if ("destination" in context) {
    clonedInit.destination = context.destination;
  }
  const cloned = new TransformContext<TSource, TDestination>(clonedInit);
  copyVars(getVars(context), getVars(cloned), overrides);
  return cloned;
}

/**
 * 同一ストアを共有する派生コンテキストを作成します。
 *
 * `signal`/`action`/`key`/`source`/`destination` は上書きでき、変数マップは共有されるため、
 * 下流の `set` が上流の `get` に見えます。`source`/`destination` は存在の有無で引き継ぐため、
 * 明示的な `undefined` で上書きできます。
 *
 * @param context 派生元のコンテキストです。
 * @param init 上書きするフィールドです。`vars` を指定したときは共有ストアに追記されます。
 * @returns 派生したコンテキストを返します。
 */
export function deriveTransformDataContext<TSourceData = any, TDestinationData = TSourceData>(
  context: TransformDataContext<TSourceData, TDestinationData>,
  init: Omit<TransformDataContextInit<TSourceData, TDestinationData>, "store" | "vars" | "key"> & {
    readonly key?: string | undefined;
    readonly vars?: VariablesInit | undefined;
  } = {},
): TransformDataContext<TSourceData, TDestinationData> {
  const derivedInit: Mutable<TransformDataContextInit<TSourceData, TDestinationData>> = {
    signal: init.signal ?? context.signal,
    action: init.action ?? context.action,
    key: init.key ?? context.key,
    source: "source" in init ? init.source : context.source,
    vars: init.vars,
    store: getVarsStore(context),
  };
  if ("destination" in init) {
    derivedInit.destination = init.destination;
  } else if ("destination" in context) {
    derivedInit.destination = context.destination;
  }
  return new TransformDataContext<TSourceData, TDestinationData>(derivedInit);
}

/**
 * 変数マップを複製した新しいコンテキストを作成します。
 *
 * `signal`/`action`/`key`/`source`/`destination` は引き継ぎ、変数と読み取り専用集合だけを複写します。
 * 上書きが指定されたときは、読み取り専用を迂回して差し替えます。
 *
 * @param context 複写元のコンテキストです。
 * @param overrides 上書きする変数です。省略時は複写のみ行います。
 * @returns 複製したコンテキストを返します。
 */
export function cloneTransformDataContext<TSourceData = any, TDestinationData = TSourceData>(
  context: TransformDataContext<TSourceData, TDestinationData>,
  overrides?: VariablesInit,
): TransformDataContext<TSourceData, TDestinationData> {
  const clonedInit: Mutable<TransformDataContextInit<TSourceData, TDestinationData>> = {
    signal: context.signal,
    action: context.action,
    key: context.key,
    source: context.source,
  };
  if ("destination" in context) {
    clonedInit.destination = context.destination;
  }
  const cloned = new TransformDataContext<TSourceData, TDestinationData>(clonedInit);
  copyVars(getVars(context), getVars(cloned), overrides);
  return cloned;
}

/**
 * 同一ストアを共有する派生コンテキストを作成します。
 *
 * `signal`/`key`/`source`/`destination` は上書きでき、変数マップは共有されるため、
 * 下流の `set` が上流の `get` に見えます。`source`/`destination` は存在の有無で引き継ぐため、
 * 明示的な `undefined` で上書きできます。
 *
 * @param context 派生元のコンテキストです。
 * @param init 上書きするフィールドです。`vars` を指定したときは共有ストアに追記されます。
 * @returns 派生したコンテキストを返します。
 */
export function deriveEncodeContext<TRawData = any, TEncodedData = TRawData>(
  context: EncodeContext<TRawData, TEncodedData>,
  init: Omit<EncodeContextInit<TRawData, TEncodedData>, "store" | "vars" | "action" | "key"> & {
    readonly key?: string | undefined;
    readonly vars?: VariablesInit | undefined;
  } = {},
): EncodeContext<TRawData, TEncodedData> {
  const derivedInit: Mutable<EncodeContextInit<TRawData, TEncodedData>> = {
    signal: init.signal ?? context.signal,
    key: init.key ?? context.key,
    source: "source" in init ? init.source : context.source,
    vars: init.vars,
    store: getVarsStore(context),
  };
  if ("destination" in init) {
    derivedInit.destination = init.destination;
  } else if ("destination" in context) {
    derivedInit.destination = context.destination;
  }
  return new EncodeContext<TRawData, TEncodedData>(derivedInit);
}

/**
 * 変数マップを複製した新しいコンテキストを作成します。
 *
 * `signal`/`key`/`source`/`destination` は引き継ぎ、変数と読み取り専用集合だけを複写します。
 * 上書きが指定されたときは、読み取り専用を迂回して差し替えます。
 *
 * @param context 複写元のコンテキストです。
 * @param overrides 上書きする変数です。省略時は複写のみ行います。
 * @returns 複製したコンテキストを返します。
 */
export function cloneEncodeContext<TRawData = any, TEncodedData = TRawData>(
  context: EncodeContext<TRawData, TEncodedData>,
  overrides?: VariablesInit,
): EncodeContext<TRawData, TEncodedData> {
  const clonedInit: Mutable<EncodeContextInit<TRawData, TEncodedData>> = {
    signal: context.signal,
    key: context.key,
    source: context.source,
  };
  if ("destination" in context) {
    clonedInit.destination = context.destination;
  }
  const cloned = new EncodeContext<TRawData, TEncodedData>(clonedInit);
  copyVars(getVars(context), getVars(cloned), overrides);
  return cloned;
}

/**
 * 同一ストアを共有する派生コンテキストを作成します。
 *
 * `signal`/`key`/`source`/`destination` は上書きでき、変数マップは共有されるため、
 * 下流の `set` が上流の `get` に見えます。`source`/`destination` は存在の有無で引き継ぐため、
 * 明示的な `undefined` で上書きできます。
 *
 * @param context 派生元のコンテキストです。
 * @param init 上書きするフィールドです。`vars` を指定したときは共有ストアに追記されます。
 * @returns 派生したコンテキストを返します。
 */
export function deriveDecodeContext<TRawData = any, TDecodedData = TRawData>(
  context: DecodeContext<TRawData, TDecodedData>,
  init: Omit<DecodeContextInit<TRawData, TDecodedData>, "store" | "vars" | "action" | "key"> & {
    readonly key?: string | undefined;
    readonly vars?: VariablesInit | undefined;
  } = {},
): DecodeContext<TRawData, TDecodedData> {
  const derivedInit: Mutable<DecodeContextInit<TRawData, TDecodedData>> = {
    signal: init.signal ?? context.signal,
    key: init.key ?? context.key,
    source: "source" in init ? init.source : context.source,
    vars: init.vars,
    store: getVarsStore(context),
  };
  if ("destination" in init) {
    derivedInit.destination = init.destination;
  } else if ("destination" in context) {
    derivedInit.destination = context.destination;
  }
  return new DecodeContext<TRawData, TDecodedData>(derivedInit);
}

/**
 * 変数マップを複製した新しいコンテキストを作成します。
 *
 * `signal`/`key`/`source`/`destination` は引き継ぎ、変数と読み取り専用集合だけを複写します。
 * 上書きが指定されたときは、読み取り専用を迂回して差し替えます。
 *
 * @param context 複写元のコンテキストです。
 * @param overrides 上書きする変数です。省略時は複写のみ行います。
 * @returns 複製したコンテキストを返します。
 */
export function cloneDecodeContext<TRawData = any, TDecodedData = TRawData>(
  context: DecodeContext<TRawData, TDecodedData>,
  overrides?: VariablesInit,
): DecodeContext<TRawData, TDecodedData> {
  const clonedInit: Mutable<DecodeContextInit<TRawData, TDecodedData>> = {
    signal: context.signal,
    key: context.key,
    source: context.source,
  };
  if ("destination" in context) {
    clonedInit.destination = context.destination;
  }
  const cloned = new DecodeContext<TRawData, TDecodedData>(clonedInit);
  copyVars(getVars(context), getVars(cloned), overrides);
  return cloned;
}

/**
 * 同一ストアを共有する派生コンテキストを作成します。
 *
 * `signal`/`action`/`key`/`source`/`destination` は上書きでき、変数マップは共有されるため、
 * 下流の `set` が上流の `get` に見えます。`source`/`destination` は存在の有無で引き継ぐため、
 * 明示的な `undefined` で上書きできます。
 *
 * @param context 派生元のコンテキストです。
 * @param init 上書きするフィールドです。`vars` を指定したときは共有ストアに追記されます。
 * @returns 派生したコンテキストを返します。
 */
export function deriveTransformStreamContext<TSourceChunk = any, TDestinationChunk = TSourceChunk>(
  context: TransformStreamContext<TSourceChunk, TDestinationChunk>,
  init: Omit<
    TransformStreamContextInit<TSourceChunk, TDestinationChunk>,
    "store" | "vars" | "key"
  > & {
    readonly key?: string | undefined;
    readonly vars?: VariablesInit | undefined;
  } = {},
): TransformStreamContext<TSourceChunk, TDestinationChunk> {
  const derivedInit: Mutable<TransformStreamContextInit<TSourceChunk, TDestinationChunk>> = {
    signal: init.signal ?? context.signal,
    action: init.action ?? context.action,
    key: init.key ?? context.key,
    source: "source" in init ? init.source : context.source,
    vars: init.vars,
    store: getVarsStore(context),
  };
  if ("destination" in init) {
    derivedInit.destination = init.destination;
  } else if ("destination" in context) {
    derivedInit.destination = context.destination;
  }
  return new TransformStreamContext<TSourceChunk, TDestinationChunk>(derivedInit);
}

/**
 * 変数マップを複製した新しいコンテキストを作成します。
 *
 * `signal`/`action`/`key`/`source`/`destination` は引き継ぎ、変数と読み取り専用集合だけを複写します。
 * 上書きが指定されたときは、読み取り専用を迂回して差し替えます。
 *
 * @param context 複写元のコンテキストです。
 * @param overrides 上書きする変数です。省略時は複写のみ行います。
 * @returns 複製したコンテキストを返します。
 */
export function cloneTransformStreamContext<TSourceChunk = any, TDestinationChunk = TSourceChunk>(
  context: TransformStreamContext<TSourceChunk, TDestinationChunk>,
  overrides?: VariablesInit,
): TransformStreamContext<TSourceChunk, TDestinationChunk> {
  const clonedInit: Mutable<TransformStreamContextInit<TSourceChunk, TDestinationChunk>> = {
    signal: context.signal,
    action: context.action,
    key: context.key,
    source: context.source,
  };
  if ("destination" in context) {
    clonedInit.destination = context.destination;
  }
  const cloned = new TransformStreamContext<TSourceChunk, TDestinationChunk>(clonedInit);
  copyVars(getVars(context), getVars(cloned), overrides);
  return cloned;
}

/**
 * 同一ストアを共有する派生コンテキストを作成します。
 *
 * `signal`/`key`/`source`/`destination` は上書きでき、変数マップは共有されるため、
 * 下流の `set` が上流の `get` に見えます。`source`/`destination` は存在の有無で引き継ぐため、
 * 明示的な `undefined` で上書きできます。
 *
 * @param context 派生元のコンテキストです。
 * @param init 上書きするフィールドです。`vars` を指定したときは共有ストアに追記されます。
 * @returns 派生したコンテキストを返します。
 */
export function deriveEncodeStreamContext<TRawChunk = any, TEncodedChunk = TRawChunk>(
  context: EncodeStreamContext<TRawChunk, TEncodedChunk>,
  init: Omit<
    EncodeStreamContextInit<TRawChunk, TEncodedChunk>,
    "store" | "vars" | "action" | "key"
  > & {
    readonly key?: string | undefined;
    readonly vars?: VariablesInit | undefined;
  } = {},
): EncodeStreamContext<TRawChunk, TEncodedChunk> {
  const derivedInit: Mutable<EncodeStreamContextInit<TRawChunk, TEncodedChunk>> = {
    signal: init.signal ?? context.signal,
    key: init.key ?? context.key,
    source: "source" in init ? init.source : context.source,
    vars: init.vars,
    store: getVarsStore(context),
  };
  if ("destination" in init) {
    derivedInit.destination = init.destination;
  } else if ("destination" in context) {
    derivedInit.destination = context.destination;
  }
  return new EncodeStreamContext<TRawChunk, TEncodedChunk>(derivedInit);
}

/**
 * 変数マップを複製した新しいコンテキストを作成します。
 *
 * `signal`/`key`/`source`/`destination` は引き継ぎ、変数と読み取り専用集合だけを複写します。
 * 上書きが指定されたときは、読み取り専用を迂回して差し替えます。
 *
 * @param context 複写元のコンテキストです。
 * @param overrides 上書きする変数です。省略時は複写のみ行います。
 * @returns 複製したコンテキストを返します。
 */
export function cloneEncodeStreamContext<TRawChunk = any, TEncodedChunk = TRawChunk>(
  context: EncodeStreamContext<TRawChunk, TEncodedChunk>,
  overrides?: VariablesInit,
): EncodeStreamContext<TRawChunk, TEncodedChunk> {
  const clonedInit: Mutable<EncodeStreamContextInit<TRawChunk, TEncodedChunk>> = {
    signal: context.signal,
    key: context.key,
    source: context.source,
  };
  if ("destination" in context) {
    clonedInit.destination = context.destination;
  }
  const cloned = new EncodeStreamContext<TRawChunk, TEncodedChunk>(clonedInit);
  copyVars(getVars(context), getVars(cloned), overrides);
  return cloned;
}

/**
 * 同一ストアを共有する派生コンテキストを作成します。
 *
 * `signal`/`key`/`source`/`destination` は上書きでき、変数マップは共有されるため、
 * 下流の `set` が上流の `get` に見えます。`source`/`destination` は存在の有無で引き継ぐため、
 * 明示的な `undefined` で上書きできます。
 *
 * @param context 派生元のコンテキストです。
 * @param init 上書きするフィールドです。`vars` を指定したときは共有ストアに追記されます。
 * @returns 派生したコンテキストを返します。
 */
export function deriveDecodeStreamContext<TRawChunk = any, TDecodedChunk = TRawChunk>(
  context: DecodeStreamContext<TRawChunk, TDecodedChunk>,
  init: Omit<
    DecodeStreamContextInit<TRawChunk, TDecodedChunk>,
    "store" | "vars" | "action" | "key"
  > & {
    readonly key?: string | undefined;
    readonly vars?: VariablesInit | undefined;
  } = {},
): DecodeStreamContext<TRawChunk, TDecodedChunk> {
  const derivedInit: Mutable<DecodeStreamContextInit<TRawChunk, TDecodedChunk>> = {
    signal: init.signal ?? context.signal,
    key: init.key ?? context.key,
    source: "source" in init ? init.source : context.source,
    vars: init.vars,
    store: getVarsStore(context),
  };
  if ("destination" in init) {
    derivedInit.destination = init.destination;
  } else if ("destination" in context) {
    derivedInit.destination = context.destination;
  }
  return new DecodeStreamContext<TRawChunk, TDecodedChunk>(derivedInit);
}

/**
 * 変数マップを複製した新しいコンテキストを作成します。
 *
 * `signal`/`key`/`source`/`destination` は引き継ぎ、変数と読み取り専用集合だけを複写します。
 * 上書きが指定されたときは、読み取り専用を迂回して差し替えます。
 *
 * @param context 複写元のコンテキストです。
 * @param overrides 上書きする変数です。省略時は複写のみ行います。
 * @returns 複製したコンテキストを返します。
 */
export function cloneDecodeStreamContext<TRawChunk = any, TDecodedChunk = TRawChunk>(
  context: DecodeStreamContext<TRawChunk, TDecodedChunk>,
  overrides?: VariablesInit,
): DecodeStreamContext<TRawChunk, TDecodedChunk> {
  const clonedInit: Mutable<DecodeStreamContextInit<TRawChunk, TDecodedChunk>> = {
    signal: context.signal,
    key: context.key,
    source: context.source,
  };
  if ("destination" in context) {
    clonedInit.destination = context.destination;
  }
  const cloned = new DecodeStreamContext<TRawChunk, TDecodedChunk>(clonedInit);
  copyVars(getVars(context), getVars(cloned), overrides);
  return cloned;
}
