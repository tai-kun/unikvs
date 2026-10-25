import { type ErrorOptions, setErrorMessage, InvalidUsageErrorBase } from "@unikvs/core";

export type { KeyNotFoundErrorArgs, KeyNotFoundErrorMeta } from "@unikvs/core";
export { KeyNotFoundError } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/ttl#errors)
 */
export type TtlInvalidValueErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/ttl#errors)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/ttl#errors)
 */
export type TtlInvalidValueErrorArgs = ErrorOptions & TtlInvalidValueErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/ttl#errors)
 */
export class TtlInvalidValueError extends InvalidUsageErrorBase<TtlInvalidValueErrorMeta> {
  static {
    this.prototype.name = "TtlInvalidValueError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/ttl#errors)
   */
  public constructor(args: TtlInvalidValueErrorArgs) {
    const { actual, ...options } = args;
    const meta: TtlInvalidValueErrorMeta = { actual };
    super(
      meta,
      ({ actual: actualValue }) =>
        `Invalid TTL value ${formatActual(actualValue)}. Expected relative seconds (number), an absolute Date, or an object like { ttl } or { expiresAt }.`,
      options,
    );
  }
}

setErrorMessage(
  TtlInvalidValueError,
  ({ actual }) =>
    `無効な TTL 値 ${formatActual(actual)} が指定されました。相対秒数 (number)、絶対時刻 (Date)、または { ttl } や { expiresAt } のようなオブジェクトを指定してください。`,
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
