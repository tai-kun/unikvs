import { type ErrorOptions, setErrorMessage, InvalidUsageErrorBase } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/key-prefix#errors)
 */
export type KeyPrefixClearDeniedErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/key-prefix#errors)
   */
  readonly prefix: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/key-prefix#errors)
   */
  readonly allowClear: boolean;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/key-prefix#errors)
 */
export type KeyPrefixClearDeniedErrorArgs = ErrorOptions & KeyPrefixClearDeniedErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/key-prefix#errors)
 */
export class KeyPrefixClearDeniedError extends InvalidUsageErrorBase<KeyPrefixClearDeniedErrorMeta> {
  static {
    this.prototype.name = "KeyPrefixClearDeniedError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/key-prefix#errors)
   */
  public constructor(args: KeyPrefixClearDeniedErrorArgs) {
    const { prefix, allowClear, ...options } = args;
    const meta: KeyPrefixClearDeniedErrorMeta = { prefix, allowClear };
    super(
      meta,
      ({ prefix }) =>
        `KeyPrefix.clear with prefix ${JSON.stringify(prefix)} cannot guarantee scoped deletion. Set allowClear to true when single-tenant exclusive use is guaranteed.`,
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
