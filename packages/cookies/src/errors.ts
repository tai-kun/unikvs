import { ErrorBase, InvalidUsageErrorBase, setErrorMessage, type ErrorOptions } from "@unikvs/core";

export type { KeyNotFoundErrorArgs, KeyNotFoundErrorMeta } from "@unikvs/core";
export { KeyNotFoundError } from "@unikvs/core";

/**
 * Cookie 値がサイズ上限を超えたときのメタ情報です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#errors)
 */
export type CookieTooLargeErrorMeta = {
  /**
   * 対象のキーです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#errors)
   */
  readonly key: string;

  /**
   * 実際のサイズ (バイト) です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#errors)
   */
  readonly actual: number;

  /**
   * サイズ上限 (バイト) です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#errors)
   */
  readonly limit: number;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#errors)
 */
export type CookieTooLargeErrorArgs = ErrorOptions & CookieTooLargeErrorMeta;

/**
 * Cookie 値がサイズ上限を超えたときに投げます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#errors)
 */
export class CookieTooLargeError extends ErrorBase<CookieTooLargeErrorMeta> {
  static {
    this.prototype.name = "UniKvsCookieTooLargeError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#errors)
   */
  public constructor(args: CookieTooLargeErrorArgs) {
    const { key, actual, limit, ...options } = args;
    const meta: CookieTooLargeErrorMeta = { key, actual, limit };
    super(
      meta,
      ({ key, actual, limit }) =>
        `Cookie value for key ${JSON.stringify(key)} is ${actual} bytes, which exceeds the size limit of ${limit} bytes.`,
      options,
    );
  }
}

setErrorMessage(
  CookieTooLargeError,
  ({ key, actual, limit }) =>
    `キー ${JSON.stringify(key)} の Cookie 値は ${actual} バイトであり、上限 ${limit} バイトを超えています`,
  "ja",
);

/**
 * Cookie API が利用できないときに投げます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#errors)
 */
export class CookieNotAvailableError extends InvalidUsageErrorBase<undefined> {
  static {
    this.prototype.name = "CookieNotAvailableError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#errors)
   */
  public constructor(options?: ErrorOptions) {
    super(
      "Cookies are not available in this environment. Inject a CookieStoreLike via options.store.",
      options,
    );
  }
}

setErrorMessage(
  CookieNotAvailableError,
  "この環境では Cookie が利用できません。options.store で CookieStoreLike を注入してください。",
  "ja",
);
