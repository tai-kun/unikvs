import { type ErrorOptions, setErrorMessage, InvalidUsageErrorBase } from "@unikvs/core";

export type { KeyNotFoundErrorArgs, KeyNotFoundErrorMeta } from "@unikvs/core";
export { KeyNotFoundError } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#error-invalid-binding)
 */
export type InvalidBindingErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#error-invalid-binding)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#error-invalid-binding)
 */
export type InvalidBindingErrorArgs = ErrorOptions & InvalidBindingErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#error-invalid-binding)
 */
export class InvalidBindingError extends InvalidUsageErrorBase<InvalidBindingErrorMeta> {
  static {
    this.prototype.name = "CloudflareKvInvalidBindingError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#error-invalid-binding)
   */
  public constructor(args: InvalidBindingErrorArgs) {
    const { actual, ...options } = args;
    const meta: InvalidBindingErrorMeta = { actual };
    super(
      meta,
      () => "Expected binding to be a KVNamespace-like object with get/put/delete/list methods",
      options,
    );
  }
}

setErrorMessage(
  InvalidBindingError,
  () =>
    "binding は get/put/delete/list メソッドを持つ KVNamespace 相当のオブジェクトでなければなりません",
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#error-invalid-key-prefix)
 */
export type InvalidKeyPrefixErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#error-invalid-key-prefix)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#error-invalid-key-prefix)
 */
export type InvalidKeyPrefixErrorArgs = ErrorOptions & InvalidKeyPrefixErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#error-invalid-key-prefix)
 */
export class InvalidKeyPrefixError extends InvalidUsageErrorBase<InvalidKeyPrefixErrorMeta> {
  static {
    this.prototype.name = "CloudflareKvInvalidKeyPrefixError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#error-invalid-key-prefix)
   */
  public constructor(args: InvalidKeyPrefixErrorArgs) {
    const { actual, ...options } = args;
    const meta: InvalidKeyPrefixErrorMeta = { actual };
    super(
      meta,
      ({ actual: messageActual }) =>
        `Expected keyPrefix to be a string, but got ${String(messageActual)}`,
      options,
    );
  }
}

setErrorMessage(
  InvalidKeyPrefixError,
  ({ actual: messageActual }) =>
    `keyPrefix は文字列でなければなりません。受け取った値: ${String(messageActual)}`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#error-invalid-ttl-seconds)
 */
export type InvalidTtlSecondsErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#error-invalid-ttl-seconds)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#error-invalid-ttl-seconds)
 */
export type InvalidTtlSecondsErrorArgs = ErrorOptions & InvalidTtlSecondsErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#error-invalid-ttl-seconds)
 */
export class InvalidTtlSecondsError extends InvalidUsageErrorBase<InvalidTtlSecondsErrorMeta> {
  static {
    this.prototype.name = "CloudflareKvInvalidTtlSecondsError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#error-invalid-ttl-seconds)
   */
  public constructor(args: InvalidTtlSecondsErrorArgs) {
    const { actual, ...options } = args;
    const meta: InvalidTtlSecondsErrorMeta = { actual };
    super(
      meta,
      ({ actual: messageActual }) =>
        `Expected ttlSeconds to be a positive integer or undefined, but got ${String(messageActual)}`,
      options,
    );
  }
}

setErrorMessage(
  InvalidTtlSecondsError,
  ({ actual: messageActual }) =>
    `ttlSeconds は正の整数または undefined でなければなりません。受け取った値: ${String(messageActual)}`,
  "ja",
);
