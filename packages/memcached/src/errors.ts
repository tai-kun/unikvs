import { type ErrorOptions, ErrorBase, setErrorMessage, InvalidUsageErrorBase } from "@unikvs/core";

export type { KeyNotFoundErrorArgs, KeyNotFoundErrorMeta } from "@unikvs/core";
export { KeyNotFoundError } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#error-invalid-ttl-seconds)
 */
export type InvalidTtlSecondsErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#invalid-ttl-seconds-actual)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#error-invalid-ttl-seconds)
 */
export type InvalidTtlSecondsErrorArgs = ErrorOptions & InvalidTtlSecondsErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#error-invalid-ttl-seconds)
 */
export class InvalidTtlSecondsError extends InvalidUsageErrorBase<InvalidTtlSecondsErrorMeta> {
  static {
    this.prototype.name = "MemcachedInvalidTtlSecondsError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#error-invalid-ttl-seconds)
   */
  public constructor(args: InvalidTtlSecondsErrorArgs) {
    const { actual, ...options } = args;
    const meta: InvalidTtlSecondsErrorMeta = { actual };
    super(
      meta,
      ({ actual: messageActual }) =>
        `\`ttlSeconds\` must be a finite number greater than or equal to 0, but got ${String(messageActual)}.`,
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
 * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#error-invalid-connect-timeout)
 */
export type InvalidConnectTimeoutErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#invalid-connect-timeout-actual)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#error-invalid-connect-timeout)
 */
export type InvalidConnectTimeoutErrorArgs = ErrorOptions & InvalidConnectTimeoutErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#error-invalid-connect-timeout)
 */
export class InvalidConnectTimeoutError extends InvalidUsageErrorBase<InvalidConnectTimeoutErrorMeta> {
  static {
    this.prototype.name = "MemcachedInvalidConnectTimeoutError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#error-invalid-connect-timeout)
   */
  public constructor(args: InvalidConnectTimeoutErrorArgs) {
    const { actual, ...options } = args;
    const meta: InvalidConnectTimeoutErrorMeta = { actual };
    super(
      meta,
      ({ actual: messageActual }) =>
        `\`connectTimeout\` must be a finite positive number (ms), but got ${String(messageActual)}.`,
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
 * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#error-connect-timeout)
 */
export type ConnectTimeoutErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#connect-timeout-timeoutms)
   */
  readonly timeoutMs: number;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#error-connect-timeout)
 */
export type ConnectTimeoutErrorArgs = ErrorOptions & ConnectTimeoutErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#error-connect-timeout)
 */
export class ConnectTimeoutError extends ErrorBase<ConnectTimeoutErrorMeta> {
  static {
    this.prototype.name = "MemcachedConnectTimeoutError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#error-connect-timeout)
   */
  public constructor(args: ConnectTimeoutErrorArgs) {
    const { timeoutMs, ...options } = args;
    const meta: ConnectTimeoutErrorMeta = { timeoutMs };
    super(
      meta,
      ({ timeoutMs: messageTimeoutMs }) =>
        `Timed out connecting to Memcached after ${messageTimeoutMs}ms`,
      options,
    );
  }
}

setErrorMessage(
  ConnectTimeoutError,
  ({ timeoutMs }) => `Memcached への接続が ${timeoutMs}ms でタイムアウトしました`,
  "ja",
);
