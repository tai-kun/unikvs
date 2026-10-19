import { InvalidUsageErrorBase, setErrorMessage, type ErrorOptions } from "@unikvs/core";

export type { KeyNotFoundErrorArgs, KeyNotFoundErrorMeta } from "@unikvs/core";
export { KeyNotFoundError } from "@unikvs/core";

/**
 * Binding の検証に失敗したときに投げます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#errors)
 */
export type InvalidBindingErrorMeta = {
  /**
   * 受け取った `binding` の値です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#errors)
   */
  readonly actual: unknown;
};

/**
 * Binding の検証に失敗したときに投げます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#errors)
 */
export type InvalidBindingErrorArgs = ErrorOptions & InvalidBindingErrorMeta;

/**
 * Binding の検証に失敗したときに投げます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#errors)
 */
export class InvalidBindingError extends InvalidUsageErrorBase<InvalidBindingErrorMeta> {
  static {
    this.prototype.name = "CloudflareKvInvalidBindingError";
  }

  /**
   * Binding の検証に失敗したときに投げます。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#errors)
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
 * `keyPrefix` の検証に失敗したときに投げます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#errors)
 */
export type InvalidKeyPrefixErrorMeta = {
  /**
   * 受け取った `keyPrefix` の値です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#errors)
   */
  readonly actual: unknown;
};

/**
 * `keyPrefix` の検証に失敗したときに投げます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#errors)
 */
export type InvalidKeyPrefixErrorArgs = ErrorOptions & InvalidKeyPrefixErrorMeta;

/**
 * `keyPrefix` の検証に失敗したときに投げます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#errors)
 */
export class InvalidKeyPrefixError extends InvalidUsageErrorBase<InvalidKeyPrefixErrorMeta> {
  static {
    this.prototype.name = "CloudflareKvInvalidKeyPrefixError";
  }

  /**
   * `keyPrefix` の検証に失敗したときに投げます。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#errors)
   */
  public constructor(args: InvalidKeyPrefixErrorArgs) {
    const { actual, ...options } = args;
    const meta: InvalidKeyPrefixErrorMeta = { actual };
    super(
      meta,
      ({ actual }) => `Expected keyPrefix to be a string, but got ${String(actual)}`,
      options,
    );
  }
}

setErrorMessage(
  InvalidKeyPrefixError,
  ({ actual }) => `keyPrefix は文字列でなければなりません。受け取った値: ${String(actual)}`,
  "ja",
);

/**
 * `ttlSeconds` の検証に失敗したときに投げます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#errors)
 */
export type InvalidTtlSecondsErrorMeta = {
  /**
   * 受け取った `ttlSeconds` の値です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#errors)
   */
  readonly actual: unknown;
};

/**
 * `ttlSeconds` の検証に失敗したときに投げます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#errors)
 */
export type InvalidTtlSecondsErrorArgs = ErrorOptions & InvalidTtlSecondsErrorMeta;

/**
 * `ttlSeconds` の検証に失敗したときに投げます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#errors)
 */
export class InvalidTtlSecondsError extends InvalidUsageErrorBase<InvalidTtlSecondsErrorMeta> {
  static {
    this.prototype.name = "CloudflareKvInvalidTtlSecondsError";
  }

  /**
   * `ttlSeconds` の検証に失敗したときに投げます。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-kv#errors)
   */
  public constructor(args: InvalidTtlSecondsErrorArgs) {
    const { actual, ...options } = args;
    const meta: InvalidTtlSecondsErrorMeta = { actual };
    super(
      meta,
      ({ actual }) =>
        `Expected ttlSeconds to be a positive integer or undefined, but got ${String(actual)}`,
      options,
    );
  }
}

setErrorMessage(
  InvalidTtlSecondsError,
  ({ actual }) =>
    `ttlSeconds は正の整数または undefined でなければなりません。受け取った値: ${String(actual)}`,
  "ja",
);
