import { ErrorBase, setErrorMessage, type ErrorOptions } from "@unikvs/core";

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
