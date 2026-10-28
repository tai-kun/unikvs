import { type ErrorOptions, ErrorBase, setErrorMessage, InvalidUsageErrorBase } from "@unikvs/core";

export type { KeyNotFoundErrorArgs, KeyNotFoundErrorMeta } from "@unikvs/core";
export { KeyNotFoundError } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#error-cookie-too-large)
 */
export type CookieTooLargeErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#error-cookie-too-large-key)
   */
  readonly key: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#error-cookie-too-large-actual)
   */
  readonly actual: number;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#error-cookie-too-large-limit)
   */
  readonly limit: number;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#error-cookie-too-large-measurement)
   */
  readonly measurement: "raw" | "serialized";
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#error-cookie-too-large)
 */
export type CookieTooLargeErrorArgs = ErrorOptions &
  Omit<CookieTooLargeErrorMeta, "measurement"> & {
    /**
     * actual が生サイズかシリアル化後のサイズかを示します。
     *
     * @default "raw"
     */
    readonly measurement?: CookieTooLargeErrorMeta["measurement"];
  };

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#error-cookie-too-large)
 */
export class CookieTooLargeError extends ErrorBase<CookieTooLargeErrorMeta> {
  static {
    this.prototype.name = "UniKvsCookieTooLargeError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#error-cookie-too-large)
   */
  public constructor(args: CookieTooLargeErrorArgs) {
    const { key, limit, actual, measurement = "raw", ...options } = args;
    const meta: CookieTooLargeErrorMeta = {
      key,
      limit,
      actual,
      measurement,
    };
    super(
      meta,
      ({
        key: messageKey,
        limit: messageLimit,
        actual: messageActual,
        measurement: messageMeasurement,
      }) =>
        messageMeasurement === "serialized"
          ? `Serialized cookie for key ${JSON.stringify(messageKey)} is ${messageActual} bytes, which exceeds the size limit of ${messageLimit} bytes.`
          : `Cookie value for key ${JSON.stringify(messageKey)} is ${messageActual} bytes, which exceeds the size limit of ${messageLimit} bytes.`,
      options,
    );
  }
}

setErrorMessage(
  CookieTooLargeError,
  ({ key, limit, actual, measurement }) =>
    measurement === "serialized"
      ? `キー ${JSON.stringify(key)} のシリアル化された Cookie は ${actual} バイトであり、上限 ${limit} バイトを超えています`
      : `キー ${JSON.stringify(key)} の Cookie 値は ${actual} バイトであり、上限 ${limit} バイトを超えています`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#error-cookie-not-available)
 */
export class CookieNotAvailableError extends InvalidUsageErrorBase<undefined> {
  static {
    this.prototype.name = "CookieNotAvailableError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#error-cookie-not-available)
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
