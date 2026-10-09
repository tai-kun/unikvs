import { ErrorBase, setErrorMessage, type ErrorOptions } from "@unikvs/core";

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
