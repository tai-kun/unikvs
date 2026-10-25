import { type ErrorOptions, ErrorBase, setErrorMessage } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/superjson#error-superjson-unsupported-value)
 */
export type SuperjsonUnsupportedValueErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/superjson#superjson-unsupported-value-type)
   */
  readonly type: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/superjson#error-superjson-unsupported-value)
 */
export type SuperjsonUnsupportedValueErrorArgs = ErrorOptions & SuperjsonUnsupportedValueErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/superjson#error-superjson-unsupported-value)
 */
export class SuperjsonUnsupportedValueError extends ErrorBase<SuperjsonUnsupportedValueErrorMeta> {
  static {
    this.prototype.name = "UniKvsSuperjsonUnsupportedValueError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/superjson#error-superjson-unsupported-value)
   */
  public constructor(args: SuperjsonUnsupportedValueErrorArgs) {
    const { type, ...options } = args;
    const meta: SuperjsonUnsupportedValueErrorMeta = { type };
    super(meta, ({ type: valueType }) => `Unsupported value type: ${valueType}`, options);
  }
}

setErrorMessage(
  SuperjsonUnsupportedValueError,
  ({ type }) => `サポートされていない値の型: ${type}`,
  "ja",
);
