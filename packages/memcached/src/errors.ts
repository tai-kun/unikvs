import { ErrorBase, InvalidUsageErrorBase, setErrorMessage, type ErrorOptions } from "@unikvs/core";

export type { KeyNotFoundErrorArgs, KeyNotFoundErrorMeta } from "@unikvs/core";
export { KeyNotFoundError } from "@unikvs/core";

/**
 * 無効な `ttlSeconds` が指定されたときのメタ情報です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#errors)
 */
export type InvalidTtlSecondsErrorMeta = {
  /**
   * 受け取った `ttlSeconds` の値です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#errors)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#errors)
 */
export type InvalidTtlSecondsErrorArgs = ErrorOptions & InvalidTtlSecondsErrorMeta;

/**
 * `ttlSeconds` が 0 以上の有限数ではないときに投げます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#errors)
 */
export class InvalidTtlSecondsError extends InvalidUsageErrorBase<InvalidTtlSecondsErrorMeta> {
  static {
    this.prototype.name = "MemcachedInvalidTtlSecondsError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#errors)
   */
  public constructor(args: InvalidTtlSecondsErrorArgs) {
    const { actual, ...options } = args;
    const meta: InvalidTtlSecondsErrorMeta = { actual };
    super(
      meta,
      ({ actual }) =>
        `\`ttlSeconds\` must be a finite number greater than or equal to 0, but got ${String(actual)}.`,
      options,
    );
  }
}

setErrorMessage(
  InvalidTtlSecondsError,
  ({ actual }) =>
    `\`ttlSeconds\` は 0 以上の有限数でなければなりません。受け取った値: ${String(actual)}`,
  "ja",
);

/**
 * 無効な `connectTimeout` が指定されたときのメタ情報です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#errors)
 */
export type InvalidConnectTimeoutErrorMeta = {
  /**
   * 受け取った `connectTimeout` の値です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#errors)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#errors)
 */
export type InvalidConnectTimeoutErrorArgs = ErrorOptions & InvalidConnectTimeoutErrorMeta;

/**
 * `connectTimeout` が有限の正数ではないときに投げます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#errors)
 */
export class InvalidConnectTimeoutError extends InvalidUsageErrorBase<InvalidConnectTimeoutErrorMeta> {
  static {
    this.prototype.name = "MemcachedInvalidConnectTimeoutError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#errors)
   */
  public constructor(args: InvalidConnectTimeoutErrorArgs) {
    const { actual, ...options } = args;
    const meta: InvalidConnectTimeoutErrorMeta = { actual };
    super(
      meta,
      ({ actual }) =>
        `\`connectTimeout\` must be a finite positive number (ms), but got ${String(actual)}.`,
      options,
    );
  }
}

setErrorMessage(
  InvalidConnectTimeoutError,
  ({ actual }) =>
    `\`connectTimeout\` は有限の正数 (ミリ秒) でなければなりません。受け取った値: ${String(actual)}`,
  "ja",
);

/**
 * 接続タイムアウトのメタ情報です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#errors)
 */
export type ConnectTimeoutErrorMeta = {
  /**
   * タイムアウトまでの時間 (ミリ秒) です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#errors)
   */
  readonly timeoutMs: number;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#errors)
 */
export type ConnectTimeoutErrorArgs = ErrorOptions & ConnectTimeoutErrorMeta;

/**
 * Memcached への接続がタイムアウトしたときに投げます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#errors)
 */
export class ConnectTimeoutError extends ErrorBase<ConnectTimeoutErrorMeta> {
  static {
    this.prototype.name = "MemcachedConnectTimeoutError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#errors)
   */
  public constructor(args: ConnectTimeoutErrorArgs) {
    const { timeoutMs, ...options } = args;
    const meta: ConnectTimeoutErrorMeta = { timeoutMs };
    super(
      meta,
      ({ timeoutMs }) => `Timed out connecting to Memcached after ${timeoutMs}ms`,
      options,
    );
  }
}

setErrorMessage(
  ConnectTimeoutError,
  ({ timeoutMs }) => `Memcached への接続が ${timeoutMs}ms でタイムアウトしました`,
  "ja",
);
