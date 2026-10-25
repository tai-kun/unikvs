import { type ErrorOptions, ErrorBase, setErrorMessage } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cbor#error-cbor-encode)
 */
export class CborEncodeError extends ErrorBase<undefined> {
  static {
    this.prototype.name = "UniKvsCborEncodeError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cbor#error-cbor-encode)
   */
  public constructor(options?: ErrorOptions) {
    super("Failed to encode a value to CBOR", options);
  }
}

setErrorMessage(CborEncodeError, "値の CBOR エンコードに失敗しました", "ja");

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cbor#error-cbor-decode)
 */
export class CborDecodeError extends ErrorBase<undefined> {
  static {
    this.prototype.name = "UniKvsCborDecodeError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cbor#error-cbor-decode)
   */
  public constructor(options?: ErrorOptions) {
    super("Failed to decode the CBOR data", options);
  }
}

setErrorMessage(CborDecodeError, "CBOR データのデコードに失敗しました", "ja");
