import {
  type IGetContext,
  type IHasContext,
  type ISetContext,
  type ICopyContext,
  type IMoveContext,
  type IOpenContext,
  type IClearContext,
  type ICloseContext,
  type IActionContext,
  type IDecodeContext,
  type IDeleteContext,
  type IEncodeContext,
  type IMapKeyContext,
  type IStreamContext,
  type IReadableStream,
  type IPipelineContext,
  type ILifecycleContext,
  type ITransformContext,
  type VariablesSnapshot,
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
export type VariablesInit = Readonly<Record<string, unknown>> | Iterable<VariablesEntry>;

/**
 * 実行時変数の初期値をエントリー列に正規化します。
 *
 * レコードは `Object.entries` で展開します。
 * 反復子はそのまま返します。
 *
 * @param vars 初期値です。
 *
 * @returns エントリー列を返します。
 */
function normalizeVariablesInit(vars: VariablesInit | undefined): Iterable<VariablesEntry> {
  if (!vars) {
    return [];
  }

  if (Symbol.iterator in vars) {
    return vars;
  }

  return Object.entries(vars);
}

/**
 * 複数のコンテキスト間で共有される変数ストアです。
 *
 * オニオン実行では操作内の全コンテキストが同一ストアを参照します。
 * 下流の `set` を上流が `await next()` の後に `get` で参照できます。
 */
export type VariablesStore = {
  /**
   * 変数のマップです。
   */
  readonly data: Map<string, unknown>;

  /**
   * 読み取り専用の変数名の集合です。
   */
  readonly readonly: Set<string>;
};

/**
 * 新しい空の変数ストアを作成します。
 *
 * @param vars 初期値です。
 *
 * @returns 空ストアを返します。
 */
export function createVariablesStore(
  vars: readonly VariablesEntry[] | undefined = [],
): VariablesStore {
  return {
    data: new Map(vars),
    readonly: new Set(),
  };
}

/**
 * `PipelineContext` の初期値です。
 */
type PipelineContextInit = {
  /**
   * 実行時変数の初期値です。
   */
  readonly vars?: VariablesInit | undefined;

  /**
   * 共有する変数ストアです。
   *
   * 指定したときは `vars` を複写せず、ストアの参照を共有します。
   * 下流の `set` は上流の `get` に見えます。
   * オニオン実行のネストで使用します。
   * 省略時は独立したストアを作成します。
   */
  readonly store?: VariablesStore | undefined;
};

/**
 * 実行時変数を保持する基底コンテキストです。
 */
class PipelineContext implements IPipelineContext {
  /**
   * 変数のマップです。共有ストアの参照である場合があります。
   */
  readonly #data: Map<string, unknown>;

  /**
   * 読み取り専用の変数名の集合です。共有ストアの参照である場合があります。
   */
  readonly #readonly: Set<string>;

  /**
   * コンテキストを作成します。
   *
   * @param init 初期値です。
   */
  public constructor(init: PipelineContextInit) {
    const { store } = init;

    if (store) {
      // 共有ストアを参照し、下流の変更が上流に見えるようにします。
      this.#data = store.data;
      this.#readonly = store.readonly;
    } else {
      this.#data = new Map();
      this.#readonly = new Set();
    }

    const vars = normalizeVariablesInit(init.vars);

    for (const [name, value] of vars) {
      this.#data.set(name, value);
    }
  }

  /**
   * 変数の値を読み取ります。
   *
   * @param name 変数名です。
   *
   * @returns 変数の値を返します。
   */
  public get(name: string): unknown {
    return this.#data.get(name);
  }

  /**
   * 変数の値を書き込みます。
   *
   * @param name 変数名です。
   * @param value 設定する値です。
   *
   * @returns 自身を返します。
   */
  public set(name: string, value: unknown): this {
    if (this.#readonly.has(name)) {
      throw new ReadonlyVariableError({ name });
    }

    this.#data.set(name, value);

    return this;
  }

  /**
   * 変数の値を設定し、読み取り専用にします。
   *
   * @param name 変数名です。
   * @param value 設定する値です。
   *
   * @returns 自身を返します。
   */
  public setReadonly(name: string, value: unknown): this {
    if (this.#readonly.has(name)) {
      throw new ReadonlyVariableError({ name });
    }

    this.#data.set(name, value);
    this.#readonly.add(name);

    return this;
  }

  /**
   * 現在の実行時変数の浅いコピーを作成します。
   *
   * @returns 実行時変数のスナップショットを返します。
   */
  public snapshot(): VariablesSnapshot {
    return new Map(this.#data);
  }
}

/**
 * `MapKeyContext` の初期値です。
 */
type MapKeyContextInit = {
  /**
   * 対象のキーです。
   */
  readonly key: string;

  /**
   * 共有する変数ストアです。
   *
   * 指定したときは `vars` を複写せず、ストアの参照を共有します。
   * 下流の `set` は上流の `get` に見えます。
   * オニオン実行のネストで使用します。
   * 省略時は独立したストアを作成します。
   */
  readonly store?: VariablesStore | undefined;

  /**
   * 実行時変数の初期値です。
   */
  readonly vars?: VariablesInit | undefined;
};

export class MapKeyContext extends PipelineContext implements IMapKeyContext {
  /**
   * 対象のキーです。
   */
  public readonly key: string;

  /**
   * コンテキストを作成します。
   *
   * @param init 初期値です。
   */
  public constructor(init: MapKeyContextInit) {
    const { key, vars, store } = init;
    super({
      vars,
      store,
    });
    this.key = key;
  }
}

/**
 * `ActionContext` の初期値です。
 */
type ActionContextInit<TAction extends IActionContext["action"]> = {
  /**
   * 実行する操作の種別です。
   */
  readonly action: TAction;

  /**
   * 中断を知らせるシグナルです。
   */
  readonly signal: AbortSignal;

  /**
   * 共有する変数ストアです。
   *
   * 指定したときは `vars` を複写せず、ストアの参照を共有します。
   * 下流の `set` は上流の `get` に見えます。
   * オニオン実行のネストで使用します。
   * 省略時は独立したストアを作成します。
   */
  readonly store?: VariablesStore | undefined;

  /**
   * 実行時変数の初期値です。
   */
  readonly vars?: VariablesInit | undefined;
};

class ActionContext<const TAction extends IActionContext["action"]>
  extends PipelineContext
  implements IActionContext
{
  /**
   * 実行する操作の種別です。
   */
  public readonly action: TAction;

  /**
   * 中断を知らせるシグナルです。
   */
  public readonly signal: AbortSignal;

  /**
   * コンテキストを作成します。
   *
   * @param init 初期値です。
   */
  public constructor(init: ActionContextInit<TAction>) {
    const { vars, store, action, signal } = init;
    super({
      vars,
      store,
    });
    this.action = action;
    this.signal = signal;
  }
}

class LifecycleContext<const TAction extends ILifecycleContext["action"]>
  extends ActionContext<TAction>
  implements ILifecycleContext {}

/**
 * `OpenContext` の初期値です。
 */
type OpenContextInit = {
  /**
   * 中断を知らせるシグナルです。
   */
  readonly signal: AbortSignal;

  /**
   * 共有する変数ストアです。
   *
   * 指定したときは `vars` を複写せず、ストアの参照を共有します。
   * 下流の `set` は上流の `get` に見えます。
   * オニオン実行のネストで使用します。
   * 省略時は独立したストアを作成します。
   */
  readonly store?: VariablesStore | undefined;

  /**
   * 実行時変数の初期値です。
   */
  readonly vars?: VariablesInit | undefined;
};

/**
 * 開始処理のコンテキストです。
 */
export class OpenContext extends LifecycleContext<"open"> implements IOpenContext {
  /**
   * コンテキストを作成します。
   *
   * @param init 初期値です。
   */
  public constructor(init: OpenContextInit) {
    super({
      ...init,
      action: "open",
    });
  }
}

/**
 * `CloseContext` の初期値です。
 */
type CloseContextInit = {
  /**
   * 中断を知らせるシグナルです。
   */
  readonly signal: AbortSignal;

  /**
   * 共有する変数ストアです。
   *
   * 指定したときは `vars` を複写せず、ストアの参照を共有します。
   * 下流の `set` は上流の `get` に見えます。
   * オニオン実行のネストで使用します。
   * 省略時は独立したストアを作成します。
   */
  readonly store?: VariablesStore | undefined;

  /**
   * 実行時変数の初期値です。
   */
  readonly vars?: VariablesInit | undefined;
};

/**
 * 終了処理のコンテキストです。
 */
export class CloseContext extends LifecycleContext<"close"> implements ICloseContext {
  /**
   * コンテキストを作成します。
   *
   * @param init 初期値です。
   */
  public constructor(init: CloseContextInit) {
    super({
      ...init,
      action: "close",
    });
  }
}

/**
 * `KeyedActionContext` の初期値です。
 */
type KeyedActionContextInit<TAction extends IKeyedActionContext["action"]> = {
  /**
   * 実行する操作の種別です。
   */
  readonly action: TAction;

  /**
   * 対象のキーです。
   */
  readonly key: string;

  /**
   * 中断を知らせるシグナルです。
   */
  readonly signal: AbortSignal;

  /**
   * 共有する変数ストアです。
   *
   * 指定したときは `vars` を複写せず、ストアの参照を共有します。
   * 下流の `set` は上流の `get` に見えます。
   * オニオン実行のネストで使用します。
   * 省略時は独立したストアを作成します。
   */
  readonly store?: VariablesStore | undefined;

  /**
   * 実行時変数の初期値です。
   */
  readonly vars?: VariablesInit | undefined;
};

class KeyedActionContext<TAction extends IKeyedActionContext["action"]>
  extends ActionContext<TAction>
  implements IKeyedActionContext
{
  /**
   * 対象のキーです。
   */
  public readonly key: string;

  /**
   * コンテキストを作成します。
   *
   * @param init 初期値です。
   */
  public constructor(init: KeyedActionContextInit<TAction>) {
    const { key, ...superInit } = init;
    super(superInit);
    this.key = key;
  }
}

/**
 * `SetContext` の初期値です。
 */
type SetContextInit = {
  /**
   * 対象のキーです。
   */
  readonly key: string;

  /**
   * 中断を知らせるシグナルです。
   */
  readonly signal: AbortSignal;

  /**
   * 共有する変数ストアです。
   *
   * 指定したときは `vars` を複写せず、ストアの参照を共有します。
   * 下流の `set` は上流の `get` に見えます。
   * オニオン実行のネストで使用します。
   * 省略時は独立したストアを作成します。
   */
  readonly store?: VariablesStore | undefined;

  /**
   * 実行時変数の初期値です。
   */
  readonly vars?: VariablesInit | undefined;
};

/**
 * 書き込み処理のコンテキストです。
 */
export class SetContext extends KeyedActionContext<"set"> implements ISetContext {
  /**
   * コンテキストを作成します。
   *
   * @param init 初期値です。
   */
  public constructor(init: SetContextInit) {
    super({
      ...init,
      action: "set",
    });
  }
}

/**
 * `GetContext` の初期値です。
 */
type GetContextInit = {
  /**
   * 対象のキーです。
   */
  readonly key: string;

  /**
   * 中断を知らせるシグナルです。
   */
  readonly signal: AbortSignal;

  /**
   * 修復の条件です。
   *
   * 省略時は修復しません。
   */
  readonly repair?: IGetContext["repair"] | undefined;

  /**
   * 共有する変数ストアです。
   *
   * 指定したときは `vars` を複写せず、ストアの参照を共有します。
   * 下流の `set` は上流の `get` に見えます。
   * オニオン実行のネストで使用します。
   * 省略時は独立したストアを作成します。
   */
  readonly store?: VariablesStore | undefined;

  /**
   * 実行時変数の初期値です。
   */
  readonly vars?: VariablesInit | undefined;
};

/**
 * 読み取り処理のコンテキストです。
 */
export class GetContext extends KeyedActionContext<"get"> implements IGetContext {
  /**
   * 修復の条件です。
   */
  public readonly repair: IGetContext["repair"];

  /**
   * コンテキストを作成します。
   *
   * @param init 初期値です。
   */
  public constructor(init: GetContextInit) {
    const {
      repair = {
        enabled: false,
        targets: [],
      },
      ...superInit
    } = init;
    super({
      ...superInit,
      action: "get",
    });
    this.repair = repair;
  }
}

/**
 * `StreamContext` の初期値です。
 */
type StreamContextInit = {
  /**
   * 対象のキーです。
   */
  readonly key: string;

  /**
   * 中断を知らせるシグナルです。
   */
  readonly signal: AbortSignal;

  /**
   * 修復の条件です。
   *
   * 省略時は修復しません。
   */
  readonly repair?: IStreamContext["repair"] | undefined;

  /**
   * 共有する変数ストアです。
   *
   * 指定したときは `vars` を複写せず、ストアの参照を共有します。
   * 下流の `set` は上流の `get` に見えます。
   * オニオン実行のネストで使用します。
   * 省略時は独立したストアを作成します。
   */
  readonly store?: VariablesStore | undefined;

  /**
   * 実行時変数の初期値です。
   */
  readonly vars?: VariablesInit | undefined;
};

/**
 * ストリーム処理のコンテキストです。
 */
export class StreamContext extends KeyedActionContext<"stream"> implements IStreamContext {
  /**
   * 修復の条件です。
   */
  public readonly repair: IStreamContext["repair"];

  /**
   * コンテキストを作成します。
   *
   * @param init 初期値です。
   */
  public constructor(init: StreamContextInit) {
    const {
      repair = {
        enabled: false,
        targets: [],
      },
      ...superInit
    } = init;
    super({
      ...superInit,
      action: "stream",
    });
    this.repair = repair;
  }
}

/**
 * `HasContext` の初期値です。
 */
type HasContextInit = {
  /**
   * 対象のキーです。
   */
  readonly key: string;

  /**
   * 中断を知らせるシグナルです。
   */
  readonly signal: AbortSignal;

  /**
   * 共有する変数ストアです。
   *
   * 指定したときは `vars` を複写せず、ストアの参照を共有します。
   * 下流の `set` は上流の `get` に見えます。
   * オニオン実行のネストで使用します。
   * 省略時は独立したストアを作成します。
   */
  readonly store?: VariablesStore | undefined;

  /**
   * 実行時変数の初期値です。
   */
  readonly vars?: VariablesInit | undefined;
};

/**
 * 存在確認のコンテキストです。
 */
export class HasContext extends KeyedActionContext<"has"> implements IHasContext {
  /**
   * コンテキストを作成します。
   *
   * @param init 初期値です。
   */
  public constructor(init: HasContextInit) {
    super({
      ...init,
      action: "has",
    });
  }
}

/**
 * `DeleteContext` の初期値です。
 */
type DeleteContextInit = {
  /**
   * 対象のキーです。
   */
  readonly key: string;

  /**
   * 中断を知らせるシグナルです。
   */
  readonly signal: AbortSignal;

  /**
   * 共有する変数ストアです。
   *
   * 指定したときは `vars` を複写せず、ストアの参照を共有します。
   * 下流の `set` は上流の `get` に見えます。
   * オニオン実行のネストで使用します。
   * 省略時は独立したストアを作成します。
   */
  readonly store?: VariablesStore | undefined;

  /**
   * 実行時変数の初期値です。
   */
  readonly vars?: VariablesInit | undefined;
};

/**
 * 削除処理のコンテキストです。
 */
export class DeleteContext extends KeyedActionContext<"delete"> implements IDeleteContext {
  /**
   * コンテキストを作成します。
   *
   * @param init 初期値です。
   */
  public constructor(init: DeleteContextInit) {
    super({
      ...init,
      action: "delete",
    });
  }
}

/**
 * コピー・移動系コンテキストの初期値です。
 */
type TransferContextInit<TAction extends "copy" | "move"> = KeyedActionContextInit<TAction> & {
  /**
   * コピー先または移動先のキーです。
   */
  readonly destinationKey: string;
};

/**
 * コピー・移動で共通のコンテキストです。
 */
class TransferContext<TAction extends "copy" | "move"> extends KeyedActionContext<TAction> {
  /**
   * コピー先または移動先のキーです。
   */
  public readonly destinationKey: string;

  /**
   * コンテキストを作成します。
   *
   * @param init 初期値です。
   */
  public constructor(init: TransferContextInit<TAction>) {
    const { destinationKey, ...superInit } = init;
    super(superInit);
    this.destinationKey = destinationKey;
  }
}

/**
 * `CopyContext` の初期値です。
 */
type CopyContextInit = Omit<TransferContextInit<"copy">, "action">;

/**
 * コピー処理のコンテキストです。
 */
export class CopyContext extends TransferContext<"copy"> implements ICopyContext {
  /**
   * コンテキストを作成します。
   *
   * @param init 初期値です。
   */
  public constructor(init: CopyContextInit) {
    super({
      ...init,
      action: "copy",
    });
  }
}

/**
 * `MoveContext` の初期値です。
 */
type MoveContextInit = Omit<TransferContextInit<"move">, "action">;

/**
 * 移動処理のコンテキストです。
 */
export class MoveContext extends TransferContext<"move"> implements IMoveContext {
  /**
   * コンテキストを作成します。
   *
   * @param init 初期値です。
   */
  public constructor(init: MoveContextInit) {
    super({
      ...init,
      action: "move",
    });
  }
}

/**
 * `ClearContext` の初期値です。
 */
type ClearContextInit = {
  /**
   * 中断を知らせるシグナルです。
   */
  readonly signal: AbortSignal;

  /**
   * 共有する変数ストアです。
   *
   * 指定したときは `vars` を複写せず、ストアの参照を共有します。
   * 下流の `set` は上流の `get` に見えます。
   * オニオン実行のネストで使用します。
   * 省略時は独立したストアを作成します。
   */
  readonly store?: VariablesStore | undefined;

  /**
   * 実行時変数の初期値です。
   */
  readonly vars?: VariablesInit | undefined;
};

/**
 * 全削除のコンテキストです。
 */
export class ClearContext extends ActionContext<"clear"> implements IClearContext {
  /**
   * コンテキストを作成します。
   *
   * @param init 初期値です。
   */
  public constructor(init: ClearContextInit) {
    super({
      ...init,
      action: "clear",
    });
  }
}

/**
 * `TransformContext` の初期値です。
 */
type TransformContextInit<TAction extends ITransformContext["action"], TSource = any> = {
  /**
   * 実行する操作の種別です。
   */
  readonly action: TAction;

  /**
   * 対象のキーです。
   */
  readonly key: string;

  /**
   * 中断を知らせるシグナルです。
   */
  readonly signal: AbortSignal;

  /**
   * 変換前の値です。
   */
  readonly source: TSource;

  /**
   * 共有する変数ストアです。
   *
   * 指定したときは `vars` を複写せず、ストアの参照を共有します。
   * 下流の `set` は上流の `get` に見えます。
   * オニオン実行のネストで使用します。
   * 省略時は独立したストアを作成します。
   */
  readonly store?: VariablesStore | undefined;

  /**
   * 実行時変数の初期値です。
   */
  readonly vars?: VariablesInit | undefined;
};

/**
 * 値変換の基底コンテキストです。
 */
class TransformContext<
  const TAction extends ITransformContext["action"],
  TSource = any,
  TDestination = TSource,
>
  extends KeyedActionContext<TAction>
  implements ITransformContext<TSource, TDestination>
{
  /**
   * 変換前の値です。
   */
  public readonly source: TSource;

  /**
   * 変換後の値です。
   *
   * ミドルウェアが設定します。
   * 存在しない場合は未設定を表します。
   * `next` の実行後は凍結され、読み取りはできますが設定すると `MiddlewareDestinationFrozenError` を投げます。
   */
  public destination?: TDestination;

  /**
   * コンテキストを作成します。
   *
   * @param init 初期値です。
   */
  public constructor(init: TransformContextInit<TAction, TSource>) {
    const { source, ...superInit } = init;
    super(superInit);
    this.source = source;
  }
}

/**
 * データ変換の基底コンテキストです。
 */
class TransformDataContext<
  const TAction extends ITransformDataContext["action"],
  TSourceData = any,
  TDestinationData = TSourceData,
>
  extends TransformContext<TAction, TSourceData, TDestinationData>
  implements ITransformDataContext<TSourceData, TDestinationData> {}

/**
 * `EncodeContext` の初期値です。
 */
type EncodeContextInit<TRawData = any> = {
  /**
   * 対象のキーです。
   */
  readonly key: string;

  /**
   * 中断を知らせるシグナルです。
   */
  readonly signal: AbortSignal;

  /**
   * 変換前の値です。
   */
  readonly source: TRawData;

  /**
   * 共有する変数ストアです。
   *
   * 指定したときは `vars` を複写せず、ストアの参照を共有します。
   * 下流の `set` は上流の `get` に見えます。
   * オニオン実行のネストで使用します。
   * 省略時は独立したストアを作成します。
   */
  readonly store?: VariablesStore | undefined;

  /**
   * 実行時変数の初期値です。
   */
  readonly vars?: VariablesInit | undefined;
};

/**
 * 符号化のコンテキストです。
 */
export class EncodeContext<TRawData = any, TEncodedData = TRawData>
  extends TransformDataContext<"set", TRawData, TEncodedData>
  implements IEncodeContext<TRawData, TEncodedData>
{
  /**
   * コンテキストを作成します。
   *
   * @param init 初期値です。
   */
  public constructor(init: EncodeContextInit<TRawData>) {
    super({
      ...init,
      action: "set",
    });
  }
}

/**
 * `DecodeContext` の初期値です。
 */
type DecodeContextInit<TRawData = any> = {
  /**
   * 対象のキーです。
   */
  readonly key: string;

  /**
   * 中断を知らせるシグナルです。
   */
  readonly signal: AbortSignal;

  /**
   * 変換前の値です。
   */
  readonly source: TRawData;

  /**
   * 共有する変数ストアです。
   *
   * 指定したときは `vars` を複写せず、ストアの参照を共有します。
   * 下流の `set` は上流の `get` に見えます。
   * オニオン実行のネストで使用します。
   * 省略時は独立したストアを作成します。
   */
  readonly store?: VariablesStore | undefined;

  /**
   * 実行時変数の初期値です。
   */
  readonly vars?: VariablesInit | undefined;
};

/**
 * 復号のコンテキストです。
 */
export class DecodeContext<TRawData = any, TDecodedData = TRawData>
  extends TransformDataContext<"get", TRawData, TDecodedData>
  implements IDecodeContext<TRawData, TDecodedData>
{
  /**
   * コンテキストを作成します。
   *
   * @param init 初期値です。
   */
  public constructor(init: DecodeContextInit<TRawData>) {
    super({
      ...init,
      action: "get",
    });
  }
}

/**
 * ストリーム変換の基底コンテキストです。
 */
class TransformStreamContext<
  TAction extends ITransformStreamContext["action"],
  TSourceChunk = any,
  TDestinationChunk = TSourceChunk,
>
  extends TransformContext<
    TAction,
    IReadableStream<TSourceChunk>,
    IReadableStream<TDestinationChunk>
  >
  implements ITransformStreamContext<TSourceChunk, TDestinationChunk> {}

/**
 * `EncodeStreamContext` の初期値です。
 */
type EncodeStreamContextInit<TRawChunk = any> = {
  /**
   * 対象のキーです。
   */
  readonly key: string;

  /**
   * 中断を知らせるシグナルです。
   */
  readonly signal: AbortSignal;

  /**
   * 変換前のストリームです。
   */
  readonly source: IReadableStream<TRawChunk>;

  /**
   * 共有する変数ストアです。
   *
   * 指定したときは `vars` を複写せず、ストアの参照を共有します。
   * 下流の `set` は上流の `get` に見えます。
   * オニオン実行のネストで使用します。
   * 省略時は独立したストアを作成します。
   */
  readonly store?: VariablesStore | undefined;

  /**
   * 実行時変数の初期値です。
   */
  readonly vars?: VariablesInit | undefined;
};

/**
 * ストリーム符号化のコンテキストです。
 */
export class EncodeStreamContext<TRawChunk = any, TEncodedChunk = TRawChunk>
  extends TransformStreamContext<"set", TRawChunk, TEncodedChunk>
  implements IEncodeStreamContext<TRawChunk, TEncodedChunk>
{
  /**
   * コンテキストを作成します。
   *
   * @param init 初期値です。
   */
  public constructor(init: EncodeStreamContextInit<TRawChunk>) {
    super({
      ...init,
      action: "set",
    });
  }
}

/**
 * `DecodeStreamContext` の初期値です。
 */
type DecodeStreamContextInit<TRawChunk = any> = {
  /**
   * 対象のキーです。
   */
  readonly key: string;

  /**
   * 中断を知らせるシグナルです。
   */
  readonly signal: AbortSignal;

  /**
   * 変換前のストリームです。
   */
  readonly source: IReadableStream<TRawChunk>;

  /**
   * 共有する変数ストアです。
   *
   * 指定したときは `vars` を複写せず、ストアの参照を共有します。
   * 下流の `set` は上流の `get` に見えます。
   * オニオン実行のネストで使用します。
   * 省略時は独立したストアを作成します。
   */
  readonly store?: VariablesStore | undefined;

  /**
   * 実行時変数の初期値です。
   */
  readonly vars?: VariablesInit | undefined;
};

/**
 * ストリーム復号のコンテキストです。
 */
export class DecodeStreamContext<TRawChunk = any, TDecodedChunk = TRawChunk>
  extends TransformStreamContext<"stream", TRawChunk, TDecodedChunk>
  implements IDecodeStreamContext<TRawChunk, TDecodedChunk>
{
  /**
   * コンテキストを作成します。
   *
   * @param init 初期値です。
   */
  public constructor(init: DecodeStreamContextInit<TRawChunk>) {
    super({
      ...init,
      action: "stream",
    });
  }
}
