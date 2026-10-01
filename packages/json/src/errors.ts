import { ErrorBase, setErrorMessage, type ErrorOptions } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/json#errors)
 */
export type JsonUnsupportedValueErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/json#errors)
   */
  readonly type: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/json#errors)
 */
export type JsonUnsupportedValueErrorArgs = ErrorOptions & JsonUnsupportedValueErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/json#errors)
 */
export class JsonUnsupportedValueError extends ErrorBase<JsonUnsupportedValueErrorMeta> {
  static {
    this.prototype.name = "UniKvsJsonUnsupportedValueError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/json#errors)
   */
  public constructor(args: JsonUnsupportedValueErrorArgs) {
    const { type, ...options } = args;
    const meta: JsonUnsupportedValueErrorMeta = { type };
    super(meta, ({ type }) => `JSON cannot serialize a value of type ${type}`, options);
  }
}

setErrorMessage(
  JsonUnsupportedValueError,
  ({ type }) => `型 ${type} の値は JSON にシリアライズできません`,
  "ja",
);
