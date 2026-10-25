import { type ErrorOptions, setErrorMessage, InvalidUsageErrorBase } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/readonly#error-read-only-set-not-allowed)
 */
export type ReadOnlySetNotAllowedErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/readonly#error-read-only-set-not-allowed)
   */
  readonly key: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/readonly#error-read-only-set-not-allowed)
 */
export type ReadOnlySetNotAllowedErrorArgs = ErrorOptions & ReadOnlySetNotAllowedErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/readonly#error-read-only-set-not-allowed)
 */
export class ReadOnlySetNotAllowedError extends InvalidUsageErrorBase<ReadOnlySetNotAllowedErrorMeta> {
  static {
    this.prototype.name = "ReadOnlySetNotAllowedError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/readonly#error-read-only-set-not-allowed)
   */
  public constructor(args: ReadOnlySetNotAllowedErrorArgs) {
    const { key, ...options } = args;
    const meta: ReadOnlySetNotAllowedErrorMeta = { key };
    super(
      meta,
      ({ key: messageKey }) => `ReadOnly.set cannot write key ${JSON.stringify(messageKey)}.`,
      options,
    );
  }
}

setErrorMessage(
  ReadOnlySetNotAllowedError,
  ({ key }) => `ReadOnly.set は読み取り専用のためキー ${JSON.stringify(key)} に書き込めません。`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/readonly#error-read-only-delete-not-allowed)
 */
export type ReadOnlyDeleteNotAllowedErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/readonly#error-read-only-delete-not-allowed)
   */
  readonly key: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/readonly#error-read-only-delete-not-allowed)
 */
export type ReadOnlyDeleteNotAllowedErrorArgs = ErrorOptions & ReadOnlyDeleteNotAllowedErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/readonly#error-read-only-delete-not-allowed)
 */
export class ReadOnlyDeleteNotAllowedError extends InvalidUsageErrorBase<ReadOnlyDeleteNotAllowedErrorMeta> {
  static {
    this.prototype.name = "ReadOnlyDeleteNotAllowedError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/readonly#error-read-only-delete-not-allowed)
   */
  public constructor(args: ReadOnlyDeleteNotAllowedErrorArgs) {
    const { key, ...options } = args;
    const meta: ReadOnlyDeleteNotAllowedErrorMeta = { key };
    super(
      meta,
      ({ key: messageKey }) =>
        `ReadOnly.delete with allowDelete false cannot delete key ${JSON.stringify(messageKey)}.`,
      options,
    );
  }
}

setErrorMessage(
  ReadOnlyDeleteNotAllowedError,
  ({ key }) =>
    `ReadOnly.delete は allowDelete が false のためキー ${JSON.stringify(key)} を削除できません。`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/readonly#error-read-only-clear-not-allowed)
 */
export class ReadOnlyClearNotAllowedError extends InvalidUsageErrorBase<undefined> {
  static {
    this.prototype.name = "ReadOnlyClearNotAllowedError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/readonly#error-read-only-clear-not-allowed)
   */
  public constructor(options?: ErrorOptions) {
    super("ReadOnly.clear with allowDelete false cannot delete all data.", options);
  }
}

setErrorMessage(
  ReadOnlyClearNotAllowedError,
  "ReadOnly.clear は allowDelete が false のため全件を削除できません。",
  "ja",
);
