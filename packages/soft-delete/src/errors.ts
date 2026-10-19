import { ErrorBase, InvalidUsageErrorBase, setErrorMessage, type ErrorOptions } from "@unikvs/core";

export type { KeyNotFoundErrorArgs, KeyNotFoundErrorMeta } from "@unikvs/core";
export { KeyNotFoundError } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/soft-delete#errors)
 */
export type TombstoneNotFoundErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/soft-delete#errors)
   */
  readonly key: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/soft-delete#errors)
 */
export type TombstoneNotFoundErrorArgs = ErrorOptions & TombstoneNotFoundErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/soft-delete#errors)
 */
export class TombstoneNotFoundError extends ErrorBase<TombstoneNotFoundErrorMeta> {
  static {
    this.prototype.name = "UniKvsTombstoneNotFoundError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/soft-delete#errors)
   */
  public constructor(args: TombstoneNotFoundErrorArgs) {
    const { key, ...options } = args;
    const meta: TombstoneNotFoundErrorMeta = { key };
    super(meta, ({ key }) => `Tombstone not found for key: ${key}`, options);
  }
}

setErrorMessage(
  TombstoneNotFoundError,
  ({ key }) => `キー ${key} のトゥームストーンが見つかりません`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/soft-delete#errors)
 */
export type SoftDeleteInvalidRetentionErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/soft-delete#errors)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/soft-delete#errors)
 */
export type SoftDeleteInvalidRetentionErrorArgs = ErrorOptions &
  SoftDeleteInvalidRetentionErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/soft-delete#errors)
 */
export class SoftDeleteInvalidRetentionError extends InvalidUsageErrorBase<SoftDeleteInvalidRetentionErrorMeta> {
  static {
    this.prototype.name = "UniKvsSoftDeleteInvalidRetentionError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/soft-delete#errors)
   */
  public constructor(args: SoftDeleteInvalidRetentionErrorArgs) {
    const { actual, ...options } = args;
    const meta: SoftDeleteInvalidRetentionErrorMeta = { actual };
    super(
      meta,
      ({ actual }) =>
        `Invalid retentionMs ${String(actual)}: retentionMs must be a non-negative finite number of milliseconds.`,
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
