import {
  type IGetContext,
  type IActionContext,
  type IPipelineContext,
  ReadonlyVariableError,
} from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#test-context-values)
 */
export type TestContextValues =
  | Readonly<Record<string, unknown>>
  | Iterable<readonly [key: string, value: unknown]>;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#test-context-repair)
 */
export type TestContextRepair = IGetContext["repair"];

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#test-context-init)
 */
export type TestContextInit = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#test-context-init-signal)
   */
  readonly signal?: AbortSignal | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#test-context-init-action)
   */
  readonly action?: IActionContext["action"] | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#test-context-init-key)
   */
  readonly key?: string | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#test-context-init-repair)
   */
  readonly repair?: TestContextRepair | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#test-context-init-source)
   */
  readonly source?: unknown;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#test-context-init-destination)
   */
  readonly destination?: unknown;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#test-context-init-destination-key)
   */
  readonly destinationKey?: string | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#test-context-init-values)
   */
  readonly values?: TestContextValues | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#test-context)
 */
export class TestContext<TTypes extends object = {}> implements IPipelineContext<TTypes> {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#test-context-signal)
   */
  public readonly signal: AbortSignal;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#test-context-action)
   */
  public readonly action: IActionContext["action"];

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#test-context-key)
   */
  public readonly key: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#test-context-repair)
   */
  public readonly repair: TestContextRepair;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#test-context-source)
   */
  public readonly source: any;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#test-context-destination)
   */
  public destination: any;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#test-context-destination-key)
   */
  public readonly destinationKey: string;

  /**
   * 変数名と値の対応を保持する内部マップです。
   */
  private readonly data: Map<string, unknown>;

  /**
   * 読み取り専用に設定済みの変数名を保持する集合です。
   */
  private readonly readonlyKeys: Set<string>;

  /**
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
      destinationKey = "",
    } = init;
    this.signal = signal ?? new AbortController().signal;
    this.action = action;
    this.key = key;
    this.repair = repair;
    this.source = source;
    this.destination = destination;
    this.destinationKey = destinationKey;

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
   * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#test-context-get)
   */
  public get(name: string): any {
    return this.data.get(name);
  }

  /**
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
 * アクションが確定したテストコンテキストです。
 */
type TestContextWithAction<TAction extends IActionContext["action"]> = TestContext & {
  readonly action: TAction;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#create-next)
 */
export function createNext(): () => Promise<void> {
  return async () => {};
}

/**
 * ファクトリー共通のコンテキスト生成処理です。
 *
 * 利用者の初期値を展開したあとにファクトリー固有の値を上書きし、最後に action を確定します。
 *
 * @param action コンテキストのアクションです。
 * @param init 利用者から渡された初期値です。
 * @param overrides ファクトリーが管理する初期値です。
 *
 * @returns アクションが絞り込まれたテストコンテキストです。
 */
function createActionContext<TAction extends IActionContext["action"]>(
  action: TAction,
  init: Omit<TestContextInit, "action">,
  overrides: Omit<TestContextInit, "action"> = {},
): TestContextWithAction<TAction> {
  return new TestContext({
    ...init,
    ...overrides,
    action,
  }) as TestContextWithAction<TAction>;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#create-open-context)
 */
export function createOpenContext(
  init: Omit<TestContextInit, "action"> = {},
): TestContextWithAction<"open"> {
  return createActionContext("open", init);
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#create-close-context)
 */
export function createCloseContext(
  init: Omit<TestContextInit, "action"> = {},
): TestContextWithAction<"close"> {
  return createActionContext("close", init);
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#create-set-context)
 */
export function createSetContext(
  key: string,
  init: Omit<TestContextInit, "action" | "key"> = {},
): TestContextWithAction<"set"> {
  return createActionContext("set", init, { key });
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#create-repair-context)
 */
export function createRepairContext(
  key: string,
  targets: readonly string[] = [],
  init: Omit<TestContextInit, "action" | "key" | "repair"> = {},
): TestContextWithAction<"get"> {
  return createActionContext("get", init, {
    key,
    repair: {
      enabled: true,
      targets: [...targets],
    } as unknown as TestContextRepair,
  });
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#create-get-context)
 */
export function createGetContext(
  key: string,
  init: Omit<TestContextInit, "action" | "key"> = {},
): TestContextWithAction<"get"> {
  return createActionContext("get", init, { key });
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#create-stream-context)
 */
export function createStreamContext(
  key: string,
  init: Omit<TestContextInit, "action" | "key"> = {},
): TestContextWithAction<"stream"> {
  return createActionContext("stream", init, { key });
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#create-has-context)
 */
export function createHasContext(
  key: string,
  init: Omit<TestContextInit, "action" | "key"> = {},
): TestContextWithAction<"has"> {
  return createActionContext("has", init, { key });
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#create-delete-context)
 */
export function createDeleteContext(
  key: string,
  init: Omit<TestContextInit, "action" | "key"> = {},
): TestContextWithAction<"delete"> {
  return createActionContext("delete", init, { key });
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#create-copy-context)
 */
export function createCopyContext(
  key: string,
  destinationKey: string,
  init: Omit<TestContextInit, "action" | "key" | "destinationKey"> = {},
): TestContextWithAction<"copy"> {
  return createActionContext("copy", init, {
    key,
    destinationKey,
  });
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#create-move-context)
 */
export function createMoveContext(
  key: string,
  destinationKey: string,
  init: Omit<TestContextInit, "action" | "key" | "destinationKey"> = {},
): TestContextWithAction<"move"> {
  return createActionContext("move", init, {
    key,
    destinationKey,
  });
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#create-clear-context)
 */
export function createClearContext(
  key = "",
  init: Omit<TestContextInit, "action" | "key"> = {},
): TestContextWithAction<"clear"> {
  return createActionContext("clear", init, { key });
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#create-map-key-context)
 */
export function createMapKeyContext(
  key: string,
  init: Omit<TestContextInit, "action" | "key"> = {},
): TestContextWithAction<"set"> {
  return createActionContext("set", init, { key });
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#create-encode-context)
 */
export function createEncodeContext(
  source: unknown,
  key = "",
  init: Omit<TestContextInit, "action" | "key" | "source"> = {},
): TestContextWithAction<"set"> {
  return createActionContext("set", init, {
    key,
    source,
  });
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#create-decode-context)
 */
export function createDecodeContext(
  source: unknown,
  key = "",
  init: Omit<TestContextInit, "action" | "key" | "source"> = {},
): TestContextWithAction<"get"> {
  return createActionContext("get", init, {
    key,
    source,
  });
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#create-encode-stream-context)
 */
export function createEncodeStreamContext(
  source: ReadableStream,
  key = "",
  init: Omit<TestContextInit, "action" | "key" | "source"> = {},
): TestContextWithAction<"set"> {
  return createActionContext("set", init, {
    key,
    source,
  });
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#create-decode-stream-context)
 */
export function createDecodeStreamContext(
  source: ReadableStream,
  key = "",
  init: Omit<TestContextInit, "action" | "key" | "source"> = {},
): TestContextWithAction<"stream"> {
  return createActionContext("stream", init, {
    key,
    source,
  });
}
