import { type ErrorOptions, ErrorBase, setErrorMessage, InvalidUsageErrorBase } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/rate-limit#error-rate-limit-exceeded)
 */
export type RateLimitExceededErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/rate-limit#rate-limit-exceeded-retry-after-ms)
   */
  readonly retryAfterMs: number;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/rate-limit#error-rate-limit-exceeded)
 */
export type RateLimitExceededErrorArgs = ErrorOptions & RateLimitExceededErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/rate-limit#error-rate-limit-exceeded)
 */
export class RateLimitExceededError extends ErrorBase<RateLimitExceededErrorMeta> {
  static {
    this.prototype.name = "RateLimitExceededError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/rate-limit#error-rate-limit-exceeded)
   */
  public constructor(args: RateLimitExceededErrorArgs) {
    const { retryAfterMs, ...options } = args;
    const meta: RateLimitExceededErrorMeta = { retryAfterMs };
    super(
      meta,
      ({ retryAfterMs: messageRetryAfterMs }) =>
        `Rate limit exceeded. Retry after ${String(messageRetryAfterMs)}ms.`,
      options,
    );
  }
}

setErrorMessage(
  RateLimitExceededError,
  ({ retryAfterMs }) =>
    `レート制限を超えました。${String(retryAfterMs)}ms 後に再試行してください。`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/rate-limit#error-rate-limit-invalid-option)
 */
export type RateLimitInvalidOptionErrorMeta = {
  /**
   * 不正だったオプション名です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/rate-limit#rate-limit-invalid-option-name)
   */
  readonly name: string;

  /**
   * 指定された値です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/rate-limit#rate-limit-invalid-option-actual)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/rate-limit#error-rate-limit-invalid-option)
 */
export type RateLimitInvalidOptionErrorArgs = ErrorOptions & RateLimitInvalidOptionErrorMeta;

/**
 * コンストラクターに不正なオプションが渡されたときのエラーです。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/rate-limit#error-rate-limit-invalid-option)
 */
export class RateLimitInvalidOptionError extends InvalidUsageErrorBase<RateLimitInvalidOptionErrorMeta> {
  static {
    this.prototype.name = "RateLimitInvalidOptionError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/rate-limit#error-rate-limit-invalid-option)
   */
  public constructor(args: RateLimitInvalidOptionErrorArgs) {
    const { name, actual, ...options } = args;
    const meta: RateLimitInvalidOptionErrorMeta = {
      name,
      actual,
    };
    super(
      meta,
      ({ name: messageName, actual: messageActual }) =>
        `Invalid RateLimit option ${JSON.stringify(messageName)}: ${formatActual(messageActual)}`,
      options,
    );
  }
}

setErrorMessage(
  RateLimitInvalidOptionError,
  ({ name, actual }) =>
    `無効な RateLimit オプション ${JSON.stringify(name)}: ${formatActual(actual)}`,
  "ja",
);

/**
 * エラーメッセージに埋め込む実際の値を整形します。
 *
 * @param actual 整形する値です。
 *
 * @returns 整形した文字列を返します。
 */
function formatActual(actual: unknown): string {
  if (typeof actual === "string") {
    return JSON.stringify(actual);
  }

  if (
    typeof actual === "number" ||
    typeof actual === "boolean" ||
    actual === null ||
    actual === undefined
  ) {
    return String(actual);
  }

  try {
    return JSON.stringify(actual) ?? "[object Object]";
  } catch {
    return "[object Object]";
  }
}
