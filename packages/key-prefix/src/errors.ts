import { type ErrorOptions, setErrorMessage, InvalidUsageErrorBase } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/key-prefix#error-key-prefix-clear-denied)
 */
export type KeyPrefixClearDeniedErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/key-prefix#key-prefix-clear-denied-prefix)
   */
  readonly prefix: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/key-prefix#key-prefix-clear-denied-allow-clear)
   */
  readonly allowClear: boolean;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/key-prefix#error-key-prefix-clear-denied)
 */
export type KeyPrefixClearDeniedErrorArgs = ErrorOptions & KeyPrefixClearDeniedErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/key-prefix#error-key-prefix-clear-denied)
 */
export class KeyPrefixClearDeniedError extends InvalidUsageErrorBase<KeyPrefixClearDeniedErrorMeta> {
  static {
    this.prototype.name = "KeyPrefixClearDeniedError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/key-prefix#error-key-prefix-clear-denied)
   */
  public constructor(args: KeyPrefixClearDeniedErrorArgs) {
    const { prefix, allowClear, ...options } = args;
    const meta: KeyPrefixClearDeniedErrorMeta = {
      prefix,
      allowClear,
    };
    super(
      meta,
      ({ prefix: prefixValue }) =>
        `KeyPrefix.clear with prefix ${JSON.stringify(prefixValue)} cannot guarantee scoped deletion. Set allowClear to true when single-tenant exclusive use is guaranteed.`,
      options,
    );
  }
}

setErrorMessage(
  KeyPrefixClearDeniedError,
  ({ prefix }) =>
    `プレフィックス ${JSON.stringify(prefix)} 付きの KeyPrefix.clear は、範囲限定削除を保証できないため拒否されました。単一テナントによる占有が保証できる場合は、allowClear: true を指定してください。`,
  "ja",
);
