import { ErrorBase, InvalidUsageErrorBase, setErrorMessage, type ErrorOptions } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/base64#errors)
 */
export class Base64DecodeError extends ErrorBase<undefined> {
  static {
    this.prototype.name = "UniKvsBase64DecodeError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/base64#errors)
   */
  public constructor(options?: ErrorOptions) {
    super("Failed to decode the base64 data", options);
  }
}

setErrorMessage(Base64DecodeError, "base64 データのデコードに失敗しました", "ja");

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/base64#errors)
 */
export type Base64InvalidPaddingErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/base64#errors)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/base64#errors)
 */
export type Base64InvalidPaddingErrorArgs = ErrorOptions & Base64InvalidPaddingErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/base64#errors)
 */
export class Base64InvalidPaddingError extends InvalidUsageErrorBase<Base64InvalidPaddingErrorMeta> {
  static {
    this.prototype.name = "UniKvsBase64InvalidPaddingError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/base64#errors)
   */
  public constructor(args: Base64InvalidPaddingErrorArgs) {
    const { actual, ...options } = args;
    const meta: Base64InvalidPaddingErrorMeta = { actual };
    super(meta, ({ actual }) => `Invalid base64 padding option: ${String(actual)}`, options);
  }
}

setErrorMessage(
  Base64InvalidPaddingError,
  ({ actual }) => `無効な base64 padding オプション: ${String(actual)}`,
  "ja",
);
