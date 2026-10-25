import { type ErrorOptions, ErrorBase, setErrorMessage, InvalidUsageErrorBase } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/base64url#error-base64url-decode)
 */
export class Base64UrlDecodeError extends ErrorBase<undefined> {
  static {
    this.prototype.name = "UniKvsBase64UrlDecodeError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/base64url#error-base64url-decode)
   */
  public constructor(options?: ErrorOptions) {
    super("Failed to decode the base64url data", options);
  }
}

setErrorMessage(Base64UrlDecodeError, "base64url データのデコードに失敗しました", "ja");

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/base64url#error-base64url-invalid-padding)
 */
export type Base64UrlInvalidPaddingErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/base64url#base64url-invalid-padding-actual)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/base64url#error-base64url-invalid-padding)
 */
export type Base64UrlInvalidPaddingErrorArgs = ErrorOptions & Base64UrlInvalidPaddingErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/base64url#error-base64url-invalid-padding)
 */
export class Base64UrlInvalidPaddingError extends InvalidUsageErrorBase<Base64UrlInvalidPaddingErrorMeta> {
  static {
    this.prototype.name = "UniKvsBase64UrlInvalidPaddingError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/base64url#error-base64url-invalid-padding)
   */
  public constructor(args: Base64UrlInvalidPaddingErrorArgs) {
    const { actual, ...options } = args;
    const meta: Base64UrlInvalidPaddingErrorMeta = { actual };
    super(
      meta,
      ({ actual: messageActual }) => `Invalid base64url padding option: ${String(messageActual)}`,
      options,
    );
  }
}

setErrorMessage(
  Base64UrlInvalidPaddingError,
  ({ actual }) => `無効な base64url padding オプション: ${String(actual)}`,
  "ja",
);
