import { ErrorBase, InvalidUsageErrorBase, setErrorMessage, type ErrorOptions } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/key-prefix#errors)
 */
export type KeyPrefixClearNotSupportedErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/key-prefix#errors)
   */
  readonly prefix: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/key-prefix#errors)
   */
  readonly clearBehavior: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/key-prefix#errors)
 */
export type KeyPrefixClearNotSupportedErrorArgs = ErrorOptions &
  KeyPrefixClearNotSupportedErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/key-prefix#errors)
 */
export class KeyPrefixClearNotSupportedError extends InvalidUsageErrorBase<KeyPrefixClearNotSupportedErrorMeta> {
  static {
    this.prototype.name = "KeyPrefixClearNotSupportedError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/key-prefix#errors)
   */
  public constructor(args: KeyPrefixClearNotSupportedErrorArgs) {
    const { prefix, clearBehavior, ...options } = args;
    const meta: KeyPrefixClearNotSupportedErrorMeta = { prefix, clearBehavior };
    super(
      meta,
      ({ prefix }) =>
        `KeyPrefix.clear with prefix ${JSON.stringify(prefix)} cannot guarantee scoped deletion. Use clearBehavior "allow" when single-tenant exclusive use is guaranteed.`,
      options,
    );
  }
}

setErrorMessage(
  KeyPrefixClearNotSupportedError,
  ({ prefix }) =>
    `プレフィックス ${JSON.stringify(prefix)} 付きの KeyPrefix.clear は範囲限定削除を保証できないため実行できません。単一テナント占有が保証できる場合には clearBehavior "allow" を使ってください`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/key-prefix#errors)
 */
export type InvalidClearBehaviorErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/key-prefix#errors)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/key-prefix#errors)
 */
export type InvalidClearBehaviorErrorArgs = ErrorOptions & InvalidClearBehaviorErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/key-prefix#errors)
 */
export class InvalidClearBehaviorError extends ErrorBase<InvalidClearBehaviorErrorMeta> {
  static {
    this.prototype.name = "KeyPrefixInvalidClearBehaviorError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/key-prefix#errors)
   */
  public constructor(args: InvalidClearBehaviorErrorArgs) {
    const { actual, ...options } = args;
    const meta: InvalidClearBehaviorErrorMeta = { actual };
    super(
      meta,
      ({ actual }) => `clearBehavior must be "allow" or "deny", but got ${String(actual)}.`,
      options,
    );
  }
}

setErrorMessage(
  InvalidClearBehaviorError,
  ({ actual }) =>
    `clearBehavior は "allow" か "deny" でなければなりません。受け取った値: ${String(actual)}`,
  "ja",
);
