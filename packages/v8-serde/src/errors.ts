import { ErrorBase, setErrorMessage, type ErrorOptions } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/v8-serde#errors)
 */
export class V8SerdeEncodeError extends ErrorBase<undefined> {
  static {
    this.prototype.name = "UniKvsV8SerdeEncodeError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/v8-serde#errors)
   */
  public constructor(options?: ErrorOptions) {
    super("Failed to encode a value with v8.serialize", options);
  }
}

setErrorMessage(V8SerdeEncodeError, "値の v8.serialize エンコードに失敗しました", "ja");

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/v8-serde#errors)
 */
export class V8SerdeDecodeError extends ErrorBase<undefined> {
  static {
    this.prototype.name = "UniKvsV8SerdeDecodeError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/v8-serde#errors)
   */
  public constructor(options?: ErrorOptions) {
    super("Failed to decode the data with v8.deserialize", options);
  }
}

setErrorMessage(V8SerdeDecodeError, "データの v8.deserialize デコードに失敗しました", "ja");

export type { UnsupportedRuntimeErrorArgs, UnsupportedRuntimeErrorMeta } from "@unikvs/core";
export { UnsupportedRuntimeError } from "@unikvs/core";
