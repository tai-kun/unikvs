import { InvalidUsageErrorBase, setErrorMessage, type ErrorOptions } from "@unikvs/core";

export type { KeyNotFoundErrorArgs, KeyNotFoundErrorMeta } from "@unikvs/core";
export { KeyNotFoundError } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/localstorage#errors)
 */
export class ClearWithoutPrefixNotAllowedError extends InvalidUsageErrorBase<undefined> {
  static {
    this.prototype.name = "LocalStorageClearWithoutPrefixNotAllowedError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/localstorage#errors)
   */
  public constructor(options?: ErrorOptions) {
    super(
      "Refusing to clear with an empty keyPrefix because it would delete the entire localStorage. Set allowClearWithoutPrefix to true to opt in.",
      options,
    );
  }
}

setErrorMessage(
  ClearWithoutPrefixNotAllowedError,
  "空の keyPrefix での clear を拒否します。localStorage 全体を削除するためです。空でない keyPrefix を設定するか、allowClearWithoutPrefix: true を指定してください。",
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/localstorage#errors)
 */
export class LocalStorageNotAvailableError extends InvalidUsageErrorBase<undefined> {
  static {
    this.prototype.name = "LocalStorageNotAvailableError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/localstorage#errors)
   */
  public constructor(options?: ErrorOptions) {
    super(
      "localStorage is not available in this environment. Inject a Storage via options.storage.",
      options,
    );
  }
}

setErrorMessage(
  LocalStorageNotAvailableError,
  "この環境では localStorage が利用できません。options.storage で Storage を注入してください。",
  "ja",
);
