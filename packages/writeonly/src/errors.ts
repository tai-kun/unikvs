import { InvalidUsageErrorBase, setErrorMessage, type ErrorOptions } from "@unikvs/core";

export type { KeyNotFoundErrorArgs, KeyNotFoundErrorMeta } from "@unikvs/core";
export { KeyNotFoundError } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#errors)
 */
export type WriteOnlyDeleteNotAllowedErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#errors)
   */
  readonly key: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#errors)
 */
export type WriteOnlyDeleteNotAllowedErrorArgs = ErrorOptions & WriteOnlyDeleteNotAllowedErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#errors)
 */
export class WriteOnlyDeleteNotAllowedError extends InvalidUsageErrorBase<WriteOnlyDeleteNotAllowedErrorMeta> {
  static {
    this.prototype.name = "WriteOnlyDeleteNotAllowedError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#errors)
   */
  public constructor(args: WriteOnlyDeleteNotAllowedErrorArgs) {
    const { key, ...options } = args;
    const meta: WriteOnlyDeleteNotAllowedErrorMeta = { key };
    super(
      meta,
      ({ key }) =>
        `WriteOnly.delete with allowDelete false cannot delete key ${JSON.stringify(key)}.`,
      options,
    );
  }
}

setErrorMessage(
  WriteOnlyDeleteNotAllowedError,
  ({ key }) =>
    `WriteOnly.delete は allowDelete が false のためキー ${JSON.stringify(key)} を削除できません。`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#errors)
 */
export class WriteOnlyClearNotAllowedError extends InvalidUsageErrorBase<undefined> {
  static {
    this.prototype.name = "WriteOnlyClearNotAllowedError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#errors)
   */
  public constructor(options?: ErrorOptions) {
    super("WriteOnly.clear with allowDelete false cannot delete all data.", options);
  }
}

setErrorMessage(
  WriteOnlyClearNotAllowedError,
  "WriteOnly.clear は allowDelete が false のため全件を削除できません。",
  "ja",
);
