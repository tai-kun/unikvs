import {
  ReadonlyVariableError,
  type IActionContext,
  type IGetContext,
  type IPipelineContext,
} from "@unikvs/core";

/**
 * 実行時変数の初期値に使えるマップ形式です。
 *
 * 旧 `VariablesInit` と同じく、レコードまたはエントリーの反復子を受け付けます。
 */
export type VariablesInit =
  | { readonly [key: string]: unknown }
  | Iterable<readonly [key: string, value: unknown]>;

/**
 * 実行時変数の1件分の形式です。
 *
 * 旧 `VariablesEntry` と同形です。
 */
export type VariablesEntry = readonly [key: string, value: unknown];

/**
 * 書き戻し要求の形状です。
 *
 * `IGetContext` と `IStreamContext` の `repair` と同じ形状です。
 */
export type PipelineRepair = IGetContext["repair"];

/**
 * 複数のコンテキスト間で共有される変数ストアです。
 *
 * オニオン実行では、操作内の全コンテキストが同一ストアを参照し、下流の `set` を上流が `await next()` の後に `get` で参照できます。
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
 * @param values 初期値です。
 * @returns 空ストアを返します。
 */
export function createVarsStore(values?: VariablesInit): VarsStore {
  const data = new Map<string, unknown>(
    values == null
      ? []
      : Symbol.iterator in Object(values)
        ? (values as Iterable<readonly [string, unknown]>)
        : Object.entries(values as { readonly [key: string]: unknown }),
  );

  return { data, readonlyKeys: new Set<string>() };
}

/**
 * `PipelineContext` のコンストラクター引数です。
 */
export type PipelineContextInit = {
  /**
   * 操作の中断に使うシグナルです。
   */
  readonly signal?: AbortSignal | undefined;

  /**
   * 実行する操作の種類です。
   */
  readonly action?: IActionContext["action"] | undefined;

  /**
   * 操作対象のキーです。
   *
   * ミドルウェア向けには論理キー、ストレージ向けには写像済みの物理キーを設定します。
   */
  readonly key?: string | undefined;

  /**
   * 読み取りに付随する書き戻し要求です。
   *
   * `get` と `stream` のコンテキストでのみ意味を持ちます。
   */
  readonly repair?: PipelineRepair | undefined;

  /**
   * 変換前の入力値です。
   */
  readonly source?: unknown;

  /**
   * 変換後の出力値です。
   */
  readonly destination?: unknown;

  /**
   * 変数の初期値です。
   *
   * `store` と併用したときは、`store` の内容に上書きされます。
   */
  readonly values?: VariablesInit | undefined;

  /**
   * 共有する変数ストアです。
   *
   * 指定したときは `values` の複写ではなくストアの参照を共有し、下流の `set` が上流の `get` に見えます。
   * オニオン実行のネストで使用します。指定しないときは独立したストアを作成します。
   *
   * @internal
   */
  readonly store?: VarsStore | undefined;
};

/**
 * パイプライン実行用の `IPipelineContext` 具象クラスです。
 *
 * `signal`/`action`/`key`/`repair`/`source`/`destination` を保持し、`get`/`set`/`setReadonly` で変数を扱います。
 * `IOpenContext` や `ISetContext` などの各コンテキスト型に構造的に代入できるため、ミドルウェアとストレージの呼び出しにそのまま使えます。
 *
 * 旧 `Variables` の代替であり、変数マップと読み取り専用集合を内部に保持します。
 */
export default class PipelineContext implements IPipelineContext {
  /**
   * 操作の中断に使うシグナルです。
   */
  public readonly signal: AbortSignal;

  /**
   * 実行する操作の種類です。
   */
  public readonly action: IActionContext["action"];

  /**
   * 操作対象のキーです。
   */
  public readonly key: string;

  /**
   * 読み取りに付随する書き戻し要求です。
   */
  public readonly repair: PipelineRepair;

  /**
   * 変換前の入力値です。
   */
  public readonly source: any;

  /**
   * 変換後の出力値です。
   */
  public destination: any;

  readonly #data: Map<string, unknown>;

  readonly #readonlyKeys: Set<string>;

  /**
   * パイプライン実行用のコンテキストを作成します。
   *
   * @param init 初期値です。
   */
  public constructor(init: PipelineContextInit = {}) {
    const {
      signal,
      action = "set",
      key = "",
      repair = { enabled: false, targets: [] },
      source,
      destination,
      values,
      store,
    } = init;
    this.signal = signal ?? new AbortController().signal;
    this.action = action;
    this.key = key;
    this.repair = repair;
    this.source = source;
    this.destination = destination;
    if (store) {
      // 共有ストアを参照し、下流の変更が上流に見えるようにします。
      this.#data = store.data;
      this.#readonlyKeys = store.readonlyKeys;
      if (values != null) {
        const entries =
          Symbol.iterator in Object(values)
            ? (values as Iterable<readonly [string, unknown]>)
            : Object.entries(values as { readonly [key: string]: unknown });
        for (const [k, v] of entries) {
          this.#data.set(k, v);
        }
      }
    } else {
      this.#data = new Map(
        values == null
          ? []
          : Symbol.iterator in Object(values)
            ? (values as Iterable<readonly [string, unknown]>)
            : Object.entries(values as { readonly [key: string]: unknown }),
      );
      this.#readonlyKeys = new Set();
    }
  }

  /**
   * 変数の値を取得します。
   *
   * @param name 取得する変数名です。
   * @returns 変数の値を返します。
   */
  public get<const TName extends string>(name: TName): any {
    return this.#data.get(name);
  }

  /**
   * 変数の値を設定します。
   *
   * @param name 設定する変数名です。
   * @param value 設定する値です。
   * @returns 自身を返します。
   */
  public set<const TName extends string>(name: TName, value: any): this {
    if (this.#readonlyKeys.has(name)) {
      throw new ReadonlyVariableError({ name });
    }

    this.#data.set(name, value);

    return this;
  }

  /**
   * 変数の値を読み取り専用として設定します。
   *
   * @param name 設定する変数名です。
   * @param value 設定する値です。
   * @returns 自身を返します。
   */
  public setReadonly<const TName extends string>(name: TName, value: any): this {
    if (this.#readonlyKeys.has(name)) {
      throw new ReadonlyVariableError({ name });
    }

    this.#data.set(name, value);
    this.#readonlyKeys.add(name);

    return this;
  }

  /**
   * 保持する変数のエントリー列を返します。
   *
   * `use` による変異を後続のストレージ操作へ引き継ぐために使用します。
   *
   * @returns 変数のエントリー列を返します。
   */
  public entries(): IterableIterator<[string, unknown]> {
    return this.#data.entries();
  }

  /**
   * 共有している変数ストアを返します。
   *
   * 派生コンテキストの作成に使用します。
   *
   * @returns 変数ストアを返します。
   */
  public getStore(): VarsStore {
    return { data: this.#data, readonlyKeys: this.#readonlyKeys };
  }

  /**
   * 同一ストアを共有する派生コンテキストを作成します。
   *
   * `signal`/`action`/`key`/`repair`/`source`/`destination` は上書きでき、変数マップは共有されるため、下流の `set` が上流の `get` に見えます。
   * オニオン実行のネストで使用します。
   *
   * @param init 上書きするフィールドです。`values` を指定したときは共有ストアに追記されます。
   * @returns 派生したコンテキストを返します。
   */
  public derive(
    init: Omit<PipelineContextInit, "store" | "values"> & {
      readonly values?: VariablesInit | undefined;
    } = {},
  ): PipelineContext {
    return new PipelineContext({
      signal: init.signal ?? this.signal,
      action: init.action ?? this.action,
      key: init.key ?? this.key,
      repair: init.repair ?? this.repair,
      source: "source" in init ? init.source : this.source,
      destination: "destination" in init ? init.destination : this.destination,
      store: this.getStore(),
      values: init.values,
    });
  }

  /**
   * 変数マップを複製した新しいコンテキストを作成します。
   *
   * `signal`/`action`/`key`/`repair`/`source`/`destination` は引き継ぎ、変数と読み取り専用集合だけを複写します。
   * 上書きが指定されたときは、読み取り専用を迂回して差し替えます。
   *
   * @param overrides 上書きする変数です。省略時は複写のみ行います。
   * @returns 複製したコンテキストを返します。
   */
  public clone(overrides?: VariablesInit): PipelineContext {
    const cloned = new PipelineContext({
      signal: this.signal,
      action: this.action,
      key: this.key,
      repair: this.repair,
      source: this.source,
      destination: this.destination,
    });
    cloned.#data.clear();
    for (const [k, v] of this.#data) {
      cloned.#data.set(k, v);
    }
    for (const k of this.#readonlyKeys) {
      cloned.#readonlyKeys.add(k);
    }

    if (overrides) {
      const entries =
        Symbol.iterator in Object(overrides)
          ? (overrides as Iterable<readonly [string, unknown]>)
          : Object.entries(overrides as { readonly [key: string]: unknown });
      for (const [k, v] of entries) {
        cloned.#data.set(k, v);
      }
    }

    return cloned;
  }
}
