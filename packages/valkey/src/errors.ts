import { type ErrorOptions, ErrorBase, setErrorMessage, InvalidUsageErrorBase } from "@unikvs/core";

export type { KeyNotFoundErrorArgs, KeyNotFoundErrorMeta } from "@unikvs/core";
export { KeyNotFoundError } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/valkey#error-cluster-not-supported)
 */
export class ClusterNotSupportedError extends InvalidUsageErrorBase<undefined> {
  static {
    this.prototype.name = "ValkeyClusterNotSupportedError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/valkey#error-cluster-not-supported)
   */
  public constructor(options?: ErrorOptions) {
    super(
      "Valkey storage v1 supports standalone mode only: the `cluster` option is not supported.",
      options,
    );
  }
}

setErrorMessage(
  ClusterNotSupportedError,
  "Valkey ストレージ v1 は standalone モードのみに対応します。`cluster` オプションはサポートされていません。",
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/valkey#error-invalid-close-timeout)
 */
export type InvalidCloseTimeoutErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/valkey#invalid-close-timeout-actual)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/valkey#error-invalid-close-timeout)
 */
export type InvalidCloseTimeoutErrorArgs = ErrorOptions & InvalidCloseTimeoutErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/valkey#error-invalid-close-timeout)
 */
export class InvalidCloseTimeoutError extends ErrorBase<InvalidCloseTimeoutErrorMeta> {
  static {
    this.prototype.name = "ValkeyInvalidCloseTimeoutError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/valkey#error-invalid-close-timeout)
   */
  public constructor(args: InvalidCloseTimeoutErrorArgs) {
    const { actual, ...options } = args;
    const meta: InvalidCloseTimeoutErrorMeta = { actual };
    super(
      meta,
      ({ actual: messageActual }) =>
        `\`closeTimeout\` must be a finite positive number (ms), but got ${String(messageActual)}.`,
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
 * [API Reference](https://tai-kun.github.io/unikvs/packages/valkey#error-invalid-ttl)
 */
export type InvalidTtlErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/valkey#invalid-ttl-actual)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/valkey#error-invalid-ttl)
 */
export type InvalidTtlErrorArgs = ErrorOptions & InvalidTtlErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/valkey#error-invalid-ttl)
 */
export class InvalidTtlError extends ErrorBase<InvalidTtlErrorMeta> {
  static {
    this.prototype.name = "ValkeyInvalidTtlError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/valkey#error-invalid-ttl)
   */
  public constructor(args: InvalidTtlErrorArgs) {
    const { actual, ...options } = args;
    const meta: InvalidTtlErrorMeta = { actual };
    super(
      meta,
      ({ actual: messageActual }) =>
        `\`ttl\` must be a finite positive number (ms), but got ${String(messageActual)}.`,
      options,
    );
  }
}

setErrorMessage(
  InvalidTtlError,
  ({ actual }) =>
    `\`ttl\` は有限の正数 (ミリ秒) でなければなりません。受け取った値: ${String(actual)}`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/valkey#error-connect-timeout)
 */
export type ConnectTimeoutErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/valkey#connect-timeout-timeoutms)
   */
  readonly timeoutMs: number;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/valkey#error-connect-timeout)
 */
export type ConnectTimeoutErrorArgs = ErrorOptions & ConnectTimeoutErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/valkey#error-connect-timeout)
 */
export class ConnectTimeoutError extends ErrorBase<ConnectTimeoutErrorMeta> {
  static {
    this.prototype.name = "ValkeyConnectTimeoutError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/valkey#error-connect-timeout)
   */
  public constructor(args: ConnectTimeoutErrorArgs) {
    const { timeoutMs, ...options } = args;
    const meta: ConnectTimeoutErrorMeta = { timeoutMs };
    super(
      meta,
      ({ timeoutMs: messageTimeoutMs }) =>
        `Timed out connecting to Valkey after ${messageTimeoutMs}ms`,
      options,
    );
  }
}

setErrorMessage(
  ConnectTimeoutError,
  ({ timeoutMs }) => `Valkey への接続が ${timeoutMs}ms でタイムアウトしました`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/valkey#error-close-timeout)
 */
export type CloseTimeoutErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/valkey#close-timeout-timeoutms)
   */
  readonly timeoutMs: number;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/valkey#error-close-timeout)
 */
export type CloseTimeoutErrorArgs = ErrorOptions & CloseTimeoutErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/valkey#error-close-timeout)
 */
export class CloseTimeoutError extends ErrorBase<CloseTimeoutErrorMeta> {
  static {
    this.prototype.name = "ValkeyCloseTimeoutError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/valkey#error-close-timeout)
   */
  public constructor(args: CloseTimeoutErrorArgs) {
    const { timeoutMs, ...options } = args;
    const meta: CloseTimeoutErrorMeta = { timeoutMs };
    super(
      meta,
      ({ timeoutMs: messageTimeoutMs }) => `Timed out closing Valkey after ${messageTimeoutMs}ms`,
      options,
    );
  }
}

setErrorMessage(
  CloseTimeoutError,
  ({ timeoutMs }) => `Valkey からの切断処理が ${timeoutMs}ms でタイムアウトしました`,
  "ja",
);
