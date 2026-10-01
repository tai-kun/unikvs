import { ErrorBase, setErrorMessage, type ErrorOptions } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/superjson)
 */
export type SuperjsonUnsupportedValueErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/superjson)
   */
  readonly type: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/superjson)
 */
export type SuperjsonUnsupportedValueErrorArgs = ErrorOptions & SuperjsonUnsupportedValueErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/superjson)
 */
export class SuperjsonUnsupportedValueError extends ErrorBase<SuperjsonUnsupportedValueErrorMeta> {
  static {
    this.prototype.name = "UniKvsSuperjsonUnsupportedValueError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/superjson)
   */
  public constructor(args: SuperjsonUnsupportedValueErrorArgs) {
    const { type, ...options } = args;
    const meta: SuperjsonUnsupportedValueErrorMeta = { type };
    super(meta, ({ type }) => `Unsupported value type: ${type}`, options);
  }
}

setErrorMessage(
  SuperjsonUnsupportedValueError,
  ({ type }) => `サポートされていない値の型: ${type}`,
  "ja",
);
