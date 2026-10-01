import { ErrorBase, setErrorMessage, type ErrorOptions } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cbor#errors)
 */
export class CborEncodeError extends ErrorBase<undefined> {
  static {
    this.prototype.name = "UniKvsCborEncodeError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cbor#errors)
   */
  public constructor(options?: ErrorOptions) {
    super("Failed to encode a value to CBOR", options);
  }
}

setErrorMessage(CborEncodeError, "値の CBOR エンコードに失敗しました", "ja");

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cbor#errors)
 */
export class CborDecodeError extends ErrorBase<undefined> {
  static {
    this.prototype.name = "UniKvsCborDecodeError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cbor#errors)
   */
  public constructor(options?: ErrorOptions) {
    super("Failed to decode the CBOR data", options);
  }
}

setErrorMessage(CborDecodeError, "CBOR データのデコードに失敗しました", "ja");
