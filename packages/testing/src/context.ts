import {
  ReadonlyVariableError,
  type IActionContext,
  type IGetContext,
  type IPipelineContext,
} from "@unikvs/core";

/**
 * コンテキストの初期値に使える変数マップの形式です。
 */
export type TestContextValues =
  | { readonly [key: string]: unknown }
  | Iterable<readonly [key: string, value: unknown]>;

/**
 * テスト用の書き戻し要求の形状です。
 *
 * IGetContext と IStreamContext の repair と同じ形状です。
 */
export type TestContextRepair = IGetContext["repair"];

/**
 * TestContext のコンストラクター引数です。
 */
export type TestContextInit = {
  /**
   * 操作の中断に使うシグナルです。
   */
  readonly signal?: AbortSignal | undefined;

  /**
   * 実行する操作の種類です。
   */
  readonly action?: IActionContext["action"] | undefined;

  /**
   * 操作対象の論理キーです。
   */
  readonly key?: string | undefined;

  /**
   * 読み取りに付随する書き戻し要求です。
   *
   * get と stream のコンテキストでのみ意味を持ちます。
   */
  readonly repair?: TestContextRepair | undefined;

  /**
   * 変換前の入力値です。
   */
  readonly source?: unknown;

  /**
   * 変換後の出力値です。
   */
  readonly destination?: unknown;

  /**
   * get/set で扱う初期値です。
   */
  readonly values?: TestContextValues | undefined;
};

/**
 * テスト用の PipelineContext の具象クラスです。
 *
 * signal/action/key/repair/source/destination を保持し、get/set/setReadonly で変数を扱います。
 * IOpenContext や ISetContext などの各コンテキスト型に構造的に代入できるため、ストレージとミドルウェアの単体テストでそのまま使えます。
 */
export class TestContext<TTypes extends object = {}> implements IPipelineContext<TTypes> {
  /**
   * 操作の中断に使うシグナルです。
   */
  public readonly signal: AbortSignal;

  /**
   * 実行する操作の種類です。
   */
  public readonly action: "open" | "close" | "set" | "get" | "stream" | "has" | "delete" | "clear";

  /**
   * 操作対象の論理キーです。
   */
  public readonly key: string;

  /**
   * 読み取りに付随する書き戻し要求です。
   */
  public readonly repair: TestContextRepair;

  /**
   * 変換前の入力値です。
   */
  public readonly source: any;

  /**
   * 変換後の出力値です。
   */
  public destination: any;

  private readonly data: Map<string, unknown>;

  private readonly readonlyKeys: Set<string>;

  /**
   * テスト用のコンテキストを作成します。
   */
  public constructor(init: TestContextInit = {}) {
    const {
      signal,
      action = "set",
      key = "",
      repair = { enabled: false, targets: [] },
      source,
      destination,
      values,
    } = init;
    this.signal = signal ?? new AbortController().signal;
    this.action = action;
    this.key = key;
    this.repair = repair;
    this.source = source;
    this.destination = destination;
    this.data = new Map(
      values == null
        ? []
        : Symbol.iterator in Object(values)
          ? (values as Iterable<readonly [string, unknown]>)
          : Object.entries(values as { readonly [key: string]: unknown }),
    );
    this.readonlyKeys = new Set();
  }

  /**
   * 変数の値を取得します。
   *
   * @param name 取得する変数名です。
   * @returns 変数の値を返します。
   */
  public get<const TName extends string>(name: TName): any {
    return this.data.get(name);
  }

  /**
   * 変数の値を設定します。
   *
   * @param name 設定する変数名です。
   * @param value 設定する値です。
   * @returns 自身を返します。
   */
  public set<const TName extends string>(name: TName, value: any): this {
    if (this.readonlyKeys.has(name)) {
      throw new ReadonlyVariableError({ name });
    }

    this.data.set(name, value);

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
    if (this.readonlyKeys.has(name)) {
      throw new ReadonlyVariableError({ name });
    }

    this.data.set(name, value);
    this.readonlyKeys.add(name);

    return this;
  }
}

/**
 * ミドルウェアの next として使う何もしない関数を作成します。
 *
 * @returns 解決済みの Promise を返す関数です。
 */
export function createNext(): () => Promise<void> {
  return async () => {};
}

/**
 * open 用のコンテキストを作成します。
 *
 * @param init 初期値です。
 * @returns open アクションのコンテキストを返します。
 */
export function createOpenContext(init: Omit<TestContextInit, "action"> = {}): TestContext {
  return new TestContext({ ...init, action: "open" });
}

/**
 * close 用のコンテキストを作成します。
 *
 * @param init 初期値です。
 * @returns close アクションのコンテキストを返します。
 */
export function createCloseContext(init: Omit<TestContextInit, "action"> = {}): TestContext {
  return new TestContext({ ...init, action: "close" });
}

/**
 * set 用のコンテキストを作成します。
 *
 * @param key 操作対象の論理キーです。
 * @param init 初期値です。
 * @returns set アクションのコンテキストを返します。
 */
export function createSetContext(
  key: string,
  init: Omit<TestContextInit, "action" | "key"> = {},
): TestContext {
  return new TestContext({ ...init, action: "set", key });
}

/**
 * 書き戻し付きの get 用コンテキストを作成します。
 *
 * 書き戻しの許可・拒否を検証するために使用します。
 *
 * @param key 操作対象の論理キーです。
 * @param targets 書き戻し対象名一覧です。
 * @param init 初期値です。
 * @returns 書き戻し要求を持つ get アクションのコンテキストを返します。
 */
export function createRepairContext(
  key: string,
  targets: readonly string[] = [],
  init: Omit<TestContextInit, "action" | "key" | "repair"> = {},
): TestContext {
  return new TestContext({
    ...init,
    action: "get",
    key,
    repair: { enabled: true, targets: [...targets] } as unknown as TestContextRepair,
  });
}

/**
 * get 用のコンテキストを作成します。
 *
 * @param key 操作対象の論理キーです。
 * @param init 初期値です。
 * @returns get アクションのコンテキストを返します。
 */
export function createGetContext(
  key: string,
  init: Omit<TestContextInit, "action" | "key"> = {},
): TestContext {
  return new TestContext({ ...init, action: "get", key });
}

/**
 * stream 用のコンテキストを作成します。
 *
 * @param key 操作対象の論理キーです。
 * @param init 初期値です。
 * @returns stream アクションのコンテキストを返します。
 */
export function createStreamContext(
  key: string,
  init: Omit<TestContextInit, "action" | "key"> = {},
): TestContext {
  return new TestContext({ ...init, action: "stream", key });
}

/**
 * has 用のコンテキストを作成します。
 *
 * @param key 操作対象の論理キーです。
 * @param init 初期値です。
 * @returns has アクションのコンテキストを返します。
 */
export function createHasContext(
  key: string,
  init: Omit<TestContextInit, "action" | "key"> = {},
): TestContext {
  return new TestContext({ ...init, action: "has", key });
}

/**
 * delete 用のコンテキストを作成します。
 *
 * @param key 操作対象の論理キーです。
 * @param init 初期値です。
 * @returns delete アクションのコンテキストを返します。
 */
export function createDeleteContext(
  key: string,
  init: Omit<TestContextInit, "action" | "key"> = {},
): TestContext {
  return new TestContext({ ...init, action: "delete", key });
}

/**
 * clear 用のコンテキストを作成します。
 *
 * @param key 操作対象の論理キーです。
 * @param init 初期値です。
 * @returns clear アクションのコンテキストを返します。
 */
export function createClearContext(
  key = "",
  init: Omit<TestContextInit, "action" | "key"> = {},
): TestContext {
  return new TestContext({ ...init, action: "clear", key });
}

/**
 * mapKey 用のコンテキストを作成します。
 *
 * @param key 操作対象の論理キーです。
 * @param init 初期値です。
 * @returns キー変換用のコンテキストを返します。
 */
export function createMapKeyContext(
  key: string,
  init: Omit<TestContextInit, "action" | "key"> = {},
): TestContext {
  return new TestContext({ ...init, key });
}

/**
 * encode 用のコンテキストを作成します。
 *
 * @param source 変換前の入力値です。
 * @param key 操作対象の論理キーです。
 * @param init 初期値です。
 * @returns encode 用のコンテキストを返します。
 */
export function createEncodeContext(
  source: unknown,
  key = "",
  init: Omit<TestContextInit, "action" | "key" | "source"> = {},
): TestContext {
  return new TestContext({ ...init, action: "set", key, source });
}

/**
 * decode 用のコンテキストを作成します。
 *
 * @param source 変換前の入力値です。
 * @param key 操作対象の論理キーです。
 * @param init 初期値です。
 * @returns decode 用のコンテキストを返します。
 */
export function createDecodeContext(
  source: unknown,
  key = "",
  init: Omit<TestContextInit, "action" | "key" | "source"> = {},
): TestContext {
  return new TestContext({ ...init, action: "get", key, source });
}

/**
 * encodeStream 用のコンテキストを作成します。
 *
 * @param source 変換前の入力ストリームです。
 * @param key 操作対象の論理キーです。
 * @param init 初期値です。
 * @returns encodeStream 用のコンテキストを返します。
 */
export function createEncodeStreamContext(
  source: ReadableStream<any>,
  key = "",
  init: Omit<TestContextInit, "action" | "key" | "source"> = {},
): TestContext {
  return new TestContext({ ...init, action: "set", key, source });
}

/**
 * decodeStream 用のコンテキストを作成します。
 *
 * @param source 変換前の入力ストリームです。
 * @param key 操作対象の論理キーです。
 * @param init 初期値です。
 * @returns decodeStream 用のコンテキストを返します。
 */
export function createDecodeStreamContext(
  source: ReadableStream<any>,
  key = "",
  init: Omit<TestContextInit, "action" | "key" | "source"> = {},
): TestContext {
  return new TestContext({ ...init, action: "stream", key, source });
}
