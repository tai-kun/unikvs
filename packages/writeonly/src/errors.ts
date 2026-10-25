import { type ErrorOptions, setErrorMessage, InvalidUsageErrorBase } from "@unikvs/core";

export type { KeyNotFoundErrorArgs, KeyNotFoundErrorMeta } from "@unikvs/core";
export { KeyNotFoundError } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#error-write-only-delete-not-allowed)
 */
export type WriteOnlyDeleteNotAllowedErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#error-write-only-delete-not-allowed)
   */
  readonly key: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#error-write-only-delete-not-allowed)
 */
export type WriteOnlyDeleteNotAllowedErrorArgs = ErrorOptions & WriteOnlyDeleteNotAllowedErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#error-write-only-delete-not-allowed)
 */
export class WriteOnlyDeleteNotAllowedError extends InvalidUsageErrorBase<WriteOnlyDeleteNotAllowedErrorMeta> {
  static {
    this.prototype.name = "WriteOnlyDeleteNotAllowedError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#error-write-only-delete-not-allowed)
   */
  public constructor(args: WriteOnlyDeleteNotAllowedErrorArgs) {
    const { key, ...options } = args;
    const meta: WriteOnlyDeleteNotAllowedErrorMeta = { key };
    super(
      meta,
      ({ key: messageKey }) =>
        `WriteOnly.delete with allowDelete false cannot delete key ${JSON.stringify(messageKey)}.`,
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
 * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#error-write-only-clear-not-allowed)
 */
export class WriteOnlyClearNotAllowedError extends InvalidUsageErrorBase<undefined> {
  static {
    this.prototype.name = "WriteOnlyClearNotAllowedError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#error-write-only-clear-not-allowed)
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
