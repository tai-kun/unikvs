import { ErrorBase, setErrorMessage, type ErrorOptions } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/hex#errors)
 */
export class HexDecodeError extends ErrorBase<undefined> {
  static {
    this.prototype.name = "UniKvsHexDecodeError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/hex#errors)
   */
  public constructor(options?: ErrorOptions) {
    super("Failed to decode the hex data", options);
  }
}

setErrorMessage(HexDecodeError, "hex データのデコードに失敗しました", "ja");
