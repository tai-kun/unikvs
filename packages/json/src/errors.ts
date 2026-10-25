import { type ErrorOptions, ErrorBase, setErrorMessage } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/json#error-json-unsupported-value)
 */
export type JsonUnsupportedValueErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/json#json-unsupported-value-type)
   */
  readonly type: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/json#error-json-unsupported-value)
 */
export type JsonUnsupportedValueErrorArgs = ErrorOptions & JsonUnsupportedValueErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/json#error-json-unsupported-value)
 */
export class JsonUnsupportedValueError extends ErrorBase<JsonUnsupportedValueErrorMeta> {
  static {
    this.prototype.name = "UniKvsJsonUnsupportedValueError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/json#error-json-unsupported-value)
   */
  public constructor(args: JsonUnsupportedValueErrorArgs) {
    const { type, ...options } = args;
    const meta: JsonUnsupportedValueErrorMeta = { type };
    super(
      meta,
      ({ type: valueType }) => `JSON cannot serialize a value of type ${valueType}`,
      options,
    );
  }
}

setErrorMessage(
  JsonUnsupportedValueError,
  ({ type }) => `型 ${type} の値は JSON にシリアライズできません`,
  "ja",
);
