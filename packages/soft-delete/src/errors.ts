import { type ErrorOptions, ErrorBase, setErrorMessage, InvalidUsageErrorBase } from "@unikvs/core";

export type { KeyNotFoundErrorArgs, KeyNotFoundErrorMeta } from "@unikvs/core";
export { KeyNotFoundError } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/soft-delete#error-tombstone-not-found)
 */
export type TombstoneNotFoundErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/soft-delete#error-tombstone-not-found)
   */
  readonly key: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/soft-delete#error-tombstone-not-found)
 */
export type TombstoneNotFoundErrorArgs = ErrorOptions & TombstoneNotFoundErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/soft-delete#error-tombstone-not-found)
 */
export class TombstoneNotFoundError extends ErrorBase<TombstoneNotFoundErrorMeta> {
  static {
    this.prototype.name = "UniKvsTombstoneNotFoundError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/soft-delete#error-tombstone-not-found)
   */
  public constructor(args: TombstoneNotFoundErrorArgs) {
    const { key, ...options } = args;
    const meta: TombstoneNotFoundErrorMeta = { key };
    super(meta, ({ key: messageKey }) => `Tombstone not found for key: ${messageKey}`, options);
  }
}

setErrorMessage(
  TombstoneNotFoundError,
  ({ key }) => `キー ${key} のトゥームストーンが見つかりません`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/soft-delete#error-soft-delete-invalid-retention)
 */
export type SoftDeleteInvalidRetentionErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/soft-delete#error-soft-delete-invalid-retention)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/soft-delete#error-soft-delete-invalid-retention)
 */
export type SoftDeleteInvalidRetentionErrorArgs = ErrorOptions &
  SoftDeleteInvalidRetentionErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/soft-delete#error-soft-delete-invalid-retention)
 */
export class SoftDeleteInvalidRetentionError extends InvalidUsageErrorBase<SoftDeleteInvalidRetentionErrorMeta> {
  static {
    this.prototype.name = "UniKvsSoftDeleteInvalidRetentionError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/soft-delete#error-soft-delete-invalid-retention)
   */
  public constructor(args: SoftDeleteInvalidRetentionErrorArgs) {
    const { actual, ...options } = args;
    const meta: SoftDeleteInvalidRetentionErrorMeta = { actual };
    super(
      meta,
      ({ actual: messageActual }) =>
        `Invalid retentionMs ${String(messageActual)}: retentionMs must be a non-negative finite number of milliseconds.`,
      options,
    );
  }
}

setErrorMessage(
  SoftDeleteInvalidRetentionError,
  ({ actual }) =>
    `無効な retentionMs ${String(actual)} が指定されました。retentionMs には 0 以上の有限な数値 (ミリ秒) を指定してください。`,
  "ja",
);
