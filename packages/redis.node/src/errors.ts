import { ErrorBase, InvalidUsageErrorBase, setErrorMessage, type ErrorOptions } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#errors)
 */
export type KeyNotFoundErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#errors)
   */
  readonly key: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#errors)
 */
export type KeyNotFoundErrorArgs = ErrorOptions & KeyNotFoundErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#errors)
 */
export class KeyNotFoundError extends ErrorBase<KeyNotFoundErrorMeta> {
  static {
    this.prototype.name = "RedisKeyNotFoundError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#errors)
   */
  public constructor(args: KeyNotFoundErrorArgs) {
    const { key, ...options } = args;
    const meta: KeyNotFoundErrorMeta = { key };
    super(meta, ({ key }) => `Key not found: ${key}`, options);
  }
}

setErrorMessage(KeyNotFoundError, ({ key }) => `キー ${key} が見つかりません`, "ja");

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#errors)
 */
export class ClusterNotSupportedError extends InvalidUsageErrorBase<undefined> {
  static {
    this.prototype.name = "RedisClusterNotSupportedError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#errors)
   */
  public constructor(options?: ErrorOptions) {
    super(
      "Redis storage v1 supports standalone mode only: the `cluster` option is not supported.",
      options,
    );
  }
}

setErrorMessage(
  ClusterNotSupportedError,
  "Redis ストレージ v1 は standalone モードのみに対応します。`cluster` オプションはサポートされていません。",
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#errors)
 */
export type InvalidCloseTimeoutErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#errors)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#errors)
 */
export type InvalidCloseTimeoutErrorArgs = ErrorOptions & InvalidCloseTimeoutErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#errors)
 */
export class InvalidCloseTimeoutError extends ErrorBase<InvalidCloseTimeoutErrorMeta> {
  static {
    this.prototype.name = "RedisInvalidCloseTimeoutError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#errors)
   */
  public constructor(args: InvalidCloseTimeoutErrorArgs) {
    const { actual, ...options } = args;
    const meta: InvalidCloseTimeoutErrorMeta = { actual };
    super(
      meta,
      ({ actual }) =>
        `\`closeTimeout\` must be a finite positive number (ms), but got ${String(actual)}.`,
      options,
    );
  }
}

setErrorMessage(
  InvalidCloseTimeoutError,
  ({ actual }) =>
    `\`closeTimeout\` は有限の正数 (ミリ秒) でなければなりません。受け取った値: ${String(actual)}`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#errors)
 */
export type ConnectTimeoutErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#errors)
   */
  readonly timeoutMs: number;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#errors)
 */
export type ConnectTimeoutErrorArgs = ErrorOptions & ConnectTimeoutErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#errors)
 */
export class ConnectTimeoutError extends ErrorBase<ConnectTimeoutErrorMeta> {
  static {
    this.prototype.name = "RedisConnectTimeoutError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#errors)
   */
  public constructor(args: ConnectTimeoutErrorArgs) {
    const { timeoutMs, ...options } = args;
    const meta: ConnectTimeoutErrorMeta = { timeoutMs };
    super(meta, ({ timeoutMs }) => `Timed out connecting to Redis after ${timeoutMs}ms`, options);
  }
}

setErrorMessage(
  ConnectTimeoutError,
  ({ timeoutMs }) => `Redis への接続が ${timeoutMs}ms でタイムアウトしました`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#errors)
 */
export type CloseTimeoutErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#errors)
   */
  readonly timeoutMs: number;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#errors)
 */
export type CloseTimeoutErrorArgs = ErrorOptions & CloseTimeoutErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#errors)
 */
export class CloseTimeoutError extends ErrorBase<CloseTimeoutErrorMeta> {
  static {
    this.prototype.name = "RedisCloseTimeoutError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#errors)
   */
  public constructor(args: CloseTimeoutErrorArgs) {
    const { timeoutMs, ...options } = args;
    const meta: CloseTimeoutErrorMeta = { timeoutMs };
    super(meta, ({ timeoutMs }) => `Timed out closing Redis after ${timeoutMs}ms`, options);
  }
}

setErrorMessage(
  CloseTimeoutError,
  ({ timeoutMs }) => `Redis からの切断処理が ${timeoutMs}ms でタイムアウトしました`,
  "ja",
);
