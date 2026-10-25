import { type ErrorOptions, setErrorMessage, InvalidUsageErrorBase } from "@unikvs/core";

export type { KeyNotFoundErrorArgs, KeyNotFoundErrorMeta } from "@unikvs/core";
export { KeyNotFoundError } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/session-storage#clear-without-prefix-not-allowed-error)
 */
export class ClearWithoutPrefixNotAllowedError extends InvalidUsageErrorBase<undefined> {
  static {
    this.prototype.name = "SessionStorageClearWithoutPrefixNotAllowedError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/session-storage#clear-without-prefix-not-allowed-error)
   */
  public constructor(options?: ErrorOptions) {
    super(
      "Refusing to clear with an empty keyPrefix because it would delete the entire sessionStorage. Set allowClearWithoutPrefix to true to opt in.",
      options,
    );
  }
}

setErrorMessage(
  ClearWithoutPrefixNotAllowedError,
  "空の keyPrefix での clear を拒否します。sessionStorage 全体を削除するためです。空でない keyPrefix を設定するか、allowClearWithoutPrefix: true を指定してください。",
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/session-storage#session-storage-not-available-error)
 */
export class SessionStorageNotAvailableError extends InvalidUsageErrorBase<undefined> {
  static {
    this.prototype.name = "SessionStorageNotAvailableError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/session-storage#session-storage-not-available-error)
   */
  public constructor(options?: ErrorOptions) {
    super(
      "sessionStorage is not available in this environment. Inject a Storage via options.storage.",
      options,
    );
  }
}

setErrorMessage(
  SessionStorageNotAvailableError,
  "この環境では sessionStorage が利用できません。options.storage で Storage を注入してください。",
  "ja",
);
