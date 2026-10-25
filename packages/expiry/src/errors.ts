import { type ErrorOptions, setErrorMessage, InvalidUsageErrorBase } from "@unikvs/core";

export type { KeyNotFoundErrorArgs, KeyNotFoundErrorMeta } from "@unikvs/core";
export { KeyNotFoundError } from "@unikvs/core";

/**
 * 無効な `expiresAt` が指定されたときのメタ情報です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/expiry#errors)
 */
export type ExpiryInvalidExpiresAtErrorMeta = {
  /**
   * 対象のキーです。コンストラクターの既定値では `undefined` です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/expiry#errors)
   */
  readonly key?: string | undefined;

  /**
   * 受け取った `expiresAt` の値です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/expiry#errors)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/expiry#errors)
 */
export type ExpiryInvalidExpiresAtErrorArgs = ErrorOptions & ExpiryInvalidExpiresAtErrorMeta;

/**
 * `expiresAt` が Date・エポックミリ秒・ISO 8601 文字列のいずれでもないときに投げます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/expiry#errors)
 */
export class ExpiryInvalidExpiresAtError extends InvalidUsageErrorBase<ExpiryInvalidExpiresAtErrorMeta> {
  static {
    this.prototype.name = "ExpiryInvalidExpiresAtError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/expiry#errors)
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
