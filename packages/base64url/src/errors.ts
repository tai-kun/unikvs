import { ErrorBase, InvalidUsageErrorBase, setErrorMessage, type ErrorOptions } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/base64url#errors)
 */
export class Base64UrlDecodeError extends ErrorBase<undefined> {
  static {
    this.prototype.name = "UniKvsBase64UrlDecodeError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/base64url#errors)
   */
  public constructor(options?: ErrorOptions) {
    super("Failed to decode the base64url data", options);
  }
}

setErrorMessage(Base64UrlDecodeError, "base64url データのデコードに失敗しました", "ja");

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/base64url#errors)
 */
export type Base64UrlInvalidPaddingErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/base64url#errors)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/base64url#errors)
 */
export type Base64UrlInvalidPaddingErrorArgs = ErrorOptions & Base64UrlInvalidPaddingErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/base64url#errors)
 */
export class Base64UrlInvalidPaddingError extends InvalidUsageErrorBase<Base64UrlInvalidPaddingErrorMeta> {
  static {
    this.prototype.name = "UniKvsBase64UrlInvalidPaddingError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/base64url#errors)
   */
  public constructor(args: Base64UrlInvalidPaddingErrorArgs) {
    const { actual, ...options } = args;
    const meta: Base64UrlInvalidPaddingErrorMeta = { actual };
    super(meta, ({ actual }) => `Invalid base64url padding option: ${String(actual)}`, options);
  }
}

setErrorMessage(
  Base64UrlInvalidPaddingError,
  ({ actual }) => `無効な base64url padding オプション: ${String(actual)}`,
  "ja",
);
