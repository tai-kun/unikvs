import { type ErrorOptions, setErrorMessage, InvalidUsageErrorBase } from "@unikvs/core";

export type { KeyNotFoundErrorArgs, KeyNotFoundErrorMeta } from "@unikvs/core";
export { KeyNotFoundError } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/expiry#error-expiry-invalid-expires-at)
 */
export type ExpiryInvalidExpiresAtErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/expiry#expiry-invalid-expires-at-key)
   */
  readonly key?: string | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/expiry#expiry-invalid-expires-at-actual)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/expiry#error-expiry-invalid-expires-at)
 */
export type ExpiryInvalidExpiresAtErrorArgs = ErrorOptions & ExpiryInvalidExpiresAtErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/expiry#error-expiry-invalid-expires-at)
 */
export class ExpiryInvalidExpiresAtError extends InvalidUsageErrorBase<ExpiryInvalidExpiresAtErrorMeta> {
  static {
    this.prototype.name = "ExpiryInvalidExpiresAtError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/expiry#error-expiry-invalid-expires-at)
   */
  public constructor(args: ExpiryInvalidExpiresAtErrorArgs) {
    const { key, actual, ...options } = args;
    const meta: ExpiryInvalidExpiresAtErrorMeta = {
      key,
      actual,
    };
    super(
      meta,
      ({ key: keyValue, actual: actualValue }) =>
        `Invalid expiresAt ${stringify(actualValue)}${
          keyValue === undefined ? "" : ` for key ${JSON.stringify(keyValue)}`
        }. Expected a Date, epoch milliseconds, or an ISO 8601 string.`,
      options,
    );
  }
}

setErrorMessage(
  ExpiryInvalidExpiresAtError,
  ({ key, actual }) =>
    `無効な expiresAt ${stringify(actual)}${
      key === undefined ? "" : ` (キー ${JSON.stringify(key)})`
    } です。Date、エポックミリ秒、ISO 8601 文字列のいずれかを指定してください。`,
  "ja",
);

function stringify(value: unknown): string {
  try {
    const json = JSON.stringify(value);

    return json ?? String(value);
  } catch {
    return String(value);
  }
}
