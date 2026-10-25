import {
  type IGetContext,
  type IActionContext,
  type IPipelineContext,
  ReadonlyVariableError,
} from "@unikvs/core";

/**
 * コンテキストの初期値に使える変数マップの形式です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#test-context-values)
 */
export type TestContextValues =
  | Readonly<Record<string, unknown>>
  | Iterable<readonly [key: string, value: unknown]>;

/**
 * テスト用の書き戻し要求の形状です。
 *
 * IGetContext と IStreamContext の repair と同じ形状です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#test-context-repair)
 */
export type TestContextRepair = IGetContext["repair"];

/**
 * TestContext のコンストラクター引数です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#test-context-init)
 */
export type TestContextInit = {
  /**
   * 操作の中断に使うシグナルです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#test-context-init-signal)
   */
  readonly signal?: AbortSignal | undefined;

  /**
   * 実行する操作の種類です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#test-context-init-action)
   */
  readonly action?: IActionContext["action"] | undefined;

  /**
   * 操作対象の論理キーです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#test-context-init-key)
   */
  readonly key?: string | undefined;

  /**
   * 読み取りに付随する書き戻し要求です。
   *
   * get と stream のコンテキストでのみ意味を持ちます。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#test-context-init-repair)
   */
  readonly repair?: TestContextRepair | undefined;

  /**
   * 変換前の入力値です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#test-context-init-source)
   */
  readonly source?: unknown;

  /**
   * 変換後の出力値です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#test-context-init-destination)
   */
  readonly destination?: unknown;

  /**
   * get/set で扱う初期値です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#test-context-init-values)
   */
  readonly values?: TestContextValues | undefined;
};

/**
 * テスト用の PipelineContext の具象クラスです。
 *
 * signal/action/key/repair/source/destination を保持し、get/set/setReadonly で変数を扱います。
 * IOpenContext や ISetContext などの各コンテキスト型に構造的に代入できるため、ストレージとミドルウェアの単体テストでそのまま使えます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#test-context)
 */
export class TestContext<TTypes extends object = {}> implements IPipelineContext<TTypes> {
  /**
   * 操作の中断に使うシグナルです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#test-context-signal)
   */
  public readonly signal: AbortSignal;

  /**
   * 実行する操作の種類です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#test-context-action)
   */
  public readonly action: "open" | "close" | "set" | "get" | "stream" | "has" | "delete" | "clear";

  /**
   * 操作対象の論理キーです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#test-context-key)
   */
  public readonly key: string;

  /**
   * 読み取りに付随する書き戻し要求です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#test-context-repair)
   */
  public readonly repair: TestContextRepair;

  /**
   * 変換前の入力値です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#test-context-source)
   */
  public readonly source: any;

  /**
   * 変換後の出力値です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#test-context-destination)
   */
  public destination: any;

  private readonly data: Map<string, unknown>;

  private readonly readonlyKeys: Set<string>;

  /**
   * テスト用のコンテキストを作成します。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#test-context)
   */
  public constructor(init: TestContextInit = {}) {
    const {
      key = "",
      action = "set",
      repair = {
        enabled: false,
        targets: [],
      },
      signal,
      source,
      values,
      destination,
    } = init;
    this.signal = signal ?? new AbortController().signal;
    this.action = action;
    this.key = key;
    this.repair = repair;
    this.source = source;
    this.destination = destination;

    let entries: readonly (readonly [string, unknown])[] = [];

    if (values !== undefined && values !== null) {
      if (Symbol.iterator in Object(values)) {
        entries = [...(values as Iterable<readonly [string, unknown]>)];
      } else {
        entries = Object.entries(values as Readonly<Record<string, unknown>>);
      }
    }

    this.data = new Map(entries);

    this.readonlyKeys = new Set();
  }

  /**
   * 変数の値を取得します。
   *
   * @param name 取得する変数名です。
   *
   * @returns 変数の値を返します。
   * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#test-context-get)
   */
  public get(name: string): any {
    return this.data.get(name);
  }

  /**
   * 変数の値を設定します。
   *
   * @param name 設定する変数名です。
   * @param value 設定する値です。
   *
   * @returns 自身を返します。
   * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#test-context-set)
   */
  public set(name: string, value: any): this {
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
   *
   * @returns 自身を返します。
   * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#test-context-setreadonly)
   */
  public setReadonly(name: string, value: any): this {
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
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#create-next)
 */
export function createNext(): () => Promise<void> {
  return async () => {};
}

/**
 * open 用のコンテキストを作成します。
 *
 * @param init 初期値です。
 *
 * @returns open アクションのコンテキストを返します。
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#create-open-context)
 */
export function createOpenContext(init: Omit<TestContextInit, "action"> = {}): TestContext {
  return new TestContext({
    ...init,
    action: "open",
  });
}

/**
 * close 用のコンテキストを作成します。
 *
 * @param init 初期値です。
 *
 * @returns close アクションのコンテキストを返します。
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#create-close-context)
 */
export function createCloseContext(init: Omit<TestContextInit, "action"> = {}): TestContext {
  return new TestContext({
    ...init,
    action: "close",
  });
}

/**
 * set 用のコンテキストを作成します。
 *
 * @param key 操作対象の論理キーです。
 * @param init 初期値です。
 *
 * @returns set アクションのコンテキストを返します。
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#create-set-context)
 */
export function createSetContext(
  key: string,
  init: Omit<TestContextInit, "action" | "key"> = {},
): TestContext {
  return new TestContext({
    ...init,
    action: "set",
    key,
  });
}

/**
 * 書き戻し付きの get 用コンテキストを作成します。
 *
 * 書き戻しの許可・拒否を検証するために使用します。
 *
 * @param key 操作対象の論理キーです。
 * @param targets 書き戻し対象名一覧です。
 * @param init 初期値です。
 *
 * @returns 書き戻し要求を持つ get アクションのコンテキストを返します。
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#create-repair-context)
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
    repair: {
      enabled: true,
      targets: [...targets],
    } as unknown as TestContextRepair,
  });
}

/**
 * get 用のコンテキストを作成します。
 *
 * @param key 操作対象の論理キーです。
 * @param init 初期値です。
 *
 * @returns get アクションのコンテキストを返します。
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#create-get-context)
 */
export function createGetContext(
  key: string,
  init: Omit<TestContextInit, "action" | "key"> = {},
): TestContext {
  return new TestContext({
    ...init,
    action: "get",
    key,
  });
}

/**
 * stream 用のコンテキストを作成します。
 *
 * @param key 操作対象の論理キーです。
 * @param init 初期値です。
 *
 * @returns stream アクションのコンテキストを返します。
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#create-stream-context)
 */
export function createStreamContext(
  key: string,
  init: Omit<TestContextInit, "action" | "key"> = {},
): TestContext {
  return new TestContext({
    ...init,
    action: "stream",
    key,
  });
}

/**
 * has 用のコンテキストを作成します。
 *
 * @param key 操作対象の論理キーです。
 * @param init 初期値です。
 *
 * @returns has アクションのコンテキストを返します。
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#create-has-context)
 */
export function createHasContext(
  key: string,
  init: Omit<TestContextInit, "action" | "key"> = {},
): TestContext {
  return new TestContext({
    ...init,
    action: "has",
    key,
  });
}

/**
 * delete 用のコンテキストを作成します。
 *
 * @param key 操作対象の論理キーです。
 * @param init 初期値です。
 *
 * @returns delete アクションのコンテキストを返します。
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#create-delete-context)
 */
export function createDeleteContext(
  key: string,
  init: Omit<TestContextInit, "action" | "key"> = {},
): TestContext {
  return new TestContext({
    ...init,
    action: "delete",
    key,
  });
}

/**
 * clear 用のコンテキストを作成します。
 *
 * @param key 操作対象の論理キーです。
 * @param init 初期値です。
 *
 * @returns clear アクションのコンテキストを返します。
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#create-clear-context)
 */
export function createClearContext(
  key = "",
  init: Omit<TestContextInit, "action" | "key"> = {},
): TestContext {
  return new TestContext({
    ...init,
    action: "clear",
    key,
  });
}

/**
 * mapKey 用のコンテキストを作成します。
 *
 * @param key 操作対象の論理キーです。
 * @param init 初期値です。
 *
 * @returns キー変換用のコンテキストを返します。
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#create-map-key-context)
 */
export function createMapKeyContext(
  key: string,
  init: Omit<TestContextInit, "action" | "key"> = {},
): TestContext {
  return new TestContext({
    ...init,
    key,
  });
}

/**
 * encode 用のコンテキストを作成します。
 *
 * @param source 変換前の入力値です。
 * @param key 操作対象の論理キーです。
 * @param init 初期値です。
 *
 * @returns encode 用のコンテキストを返します。
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#create-encode-context)
 */
export function createEncodeContext(
  source: unknown,
  key = "",
  init: Omit<TestContextInit, "action" | "key" | "source"> = {},
): TestContext {
  return new TestContext({
    ...init,
    action: "set",
    key,
    source,
  });
}

/**
 * decode 用のコンテキストを作成します。
 *
 * @param source 変換前の入力値です。
 * @param key 操作対象の論理キーです。
 * @param init 初期値です。
 *
 * @returns decode 用のコンテキストを返します。
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#create-decode-context)
 */
export function createDecodeContext(
  source: unknown,
  key = "",
  init: Omit<TestContextInit, "action" | "key" | "source"> = {},
): TestContext {
  return new TestContext({
    ...init,
    action: "get",
    key,
    source,
  });
}

/**
 * encodeStream 用のコンテキストを作成します。
 *
 * @param source 変換前の入力ストリームです。
 * @param key 操作対象の論理キーです。
 * @param init 初期値です。
 *
 * @returns encodeStream 用のコンテキストを返します。
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#create-encode-stream-context)
 */
export function createEncodeStreamContext(
  source: ReadableStream,
  key = "",
  init: Omit<TestContextInit, "action" | "key" | "source"> = {},
): TestContext {
  return new TestContext({
    ...init,
    action: "set",
    key,
    source,
  });
}

/**
 * decodeStream 用のコンテキストを作成します。
 *
 * @param source 変換前の入力ストリームです。
 * @param key 操作対象の論理キーです。
 * @param init 初期値です。
 *
 * @returns decodeStream 用のコンテキストを返します。
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#create-decode-stream-context)
 */
export function createDecodeStreamContext(
  source: ReadableStream,
  key = "",
  init: Omit<TestContextInit, "action" | "key" | "source"> = {},
): TestContext {
  return new TestContext({
    ...init,
    action: "stream",
    key,
    source,
  });
}
