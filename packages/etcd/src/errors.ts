import { type ErrorOptions, setErrorMessage, InvalidUsageErrorBase } from "@unikvs/core";

export type { KeyNotFoundErrorArgs, KeyNotFoundErrorMeta } from "@unikvs/core";
export { KeyNotFoundError } from "@unikvs/core";

/**
 * 無効な `leaseTtlSeconds` が指定されたときのメタ情報です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/etcd#errors)
 */
export type InvalidLeaseTtlErrorMeta = {
  /**
   * 受け取った `leaseTtlSeconds` の値です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/etcd#errors)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/etcd#errors)
 */
export type InvalidLeaseTtlErrorArgs = ErrorOptions & InvalidLeaseTtlErrorMeta;

/**
 * `leaseTtlSeconds` が正の整数ではないときに投げます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/etcd#errors)
 */
export class InvalidLeaseTtlError extends InvalidUsageErrorBase<InvalidLeaseTtlErrorMeta> {
  static {
    this.prototype.name = "EtcdInvalidLeaseTtlError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/etcd#errors)
   */
  public constructor(args: InvalidLeaseTtlErrorArgs) {
    const { actual, ...options } = args;
    const meta: InvalidLeaseTtlErrorMeta = { actual };
    super(
      meta,
      ({ actual: messageActual }) =>
        `\`leaseTtlSeconds\` must be a positive integer (seconds), but got ${String(messageActual)}.`,
      options,
    );
  }
}

setErrorMessage(
  InvalidLeaseTtlError,
  ({ actual }) =>
    `\`leaseTtlSeconds\` は正の整数 (秒) でなければなりません。受け取った値: ${String(actual)}`,
  "ja",
);

/**
 * 無効な `endpoints` が指定されたときのメタ情報です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/etcd#errors)
 */
export type InvalidEndpointsErrorMeta = {
  /**
   * 受け取った `endpoints` の値です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/etcd#errors)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/etcd#errors)
 */
export type InvalidEndpointsErrorArgs = ErrorOptions & InvalidEndpointsErrorMeta;

/**
 * `endpoints` が空の文字列や空の配列のときに投げます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/etcd#errors)
 */
export class InvalidEndpointsError extends InvalidUsageErrorBase<InvalidEndpointsErrorMeta> {
  static {
    this.prototype.name = "EtcdInvalidEndpointsError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/etcd#errors)
   */
  public constructor(args: InvalidEndpointsErrorArgs) {
    const { actual, ...options } = args;
    const meta: InvalidEndpointsErrorMeta = { actual };
    super(
      meta,
      ({ actual: messageActual }) =>
        `\`endpoints\` must be a non-empty string or a non-empty array of non-empty strings, but got ${String(messageActual)}.`,
      options,
    );
  }
}

setErrorMessage(
  InvalidEndpointsError,
  ({ actual }) =>
    `\`endpoints\` は空でない文字列か、空でない文字列だけを含む空でない配列でなければなりません。受け取った値: ${String(actual)}`,
  "ja",
);
