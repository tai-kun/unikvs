import { type ErrorOptions, ErrorBase, setErrorMessage, InvalidUsageErrorBase } from "@unikvs/core";

/**
 * リトライが枯渇したときのエラーのメタ情報です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#errors)
 */
export type RetryExhaustedErrorMeta = {
  /**
   * 失敗した操作名です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#errors)
   */
  readonly operation: string;

  /**
   * 実行した試行回数です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#errors)
   */
  readonly attempts: number;
};

/**
 * リトライが枯渇したときのエラーのコンストラクター引数です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#errors)
 */
export type RetryExhaustedErrorArgs = ErrorOptions & RetryExhaustedErrorMeta;

/**
 * 最大試行回数を超えても操作が成功しなかったときのエラーです。
 *
 * 最後に発生したエラーは `cause` に保持されます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#errors)
 */
export class RetryExhaustedError extends ErrorBase<RetryExhaustedErrorMeta> {
  static {
    this.prototype.name = "RetryExhaustedError";
  }

  /**
   * エラーを作成します。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#errors)
   */
  public constructor(args: RetryExhaustedErrorArgs) {
    const { attempts, operation, ...options } = args;
    const meta: RetryExhaustedErrorMeta = {
      attempts,
      operation,
    };
    super(
      meta,
      ({ attempts: messageAttempts, operation: messageOperation }) =>
        `Retry exhausted after ${messageAttempts} attempt(s) for operation ${JSON.stringify(messageOperation)}.`,
      options,
    );
  }
}

setErrorMessage(
  RetryExhaustedError,
  ({ attempts, operation }) =>
    `操作 ${JSON.stringify(operation)} は ${attempts} 回試行しましたが成功しませんでした。`,
  "ja",
);

/**
 * 不正なオプションのメタ情報です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#errors)
 */
export type RetryInvalidOptionErrorMeta = {
  /**
   * 不正だったオプション名です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#errors)
   */
  readonly name: string;

  /**
   * 指定された値です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#errors)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#errors)
 */
export type RetryInvalidOptionErrorArgs = ErrorOptions & RetryInvalidOptionErrorMeta;

/**
 * コンストラクターに不正なオプションが渡されたときのエラーです。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#errors)
 */
export class RetryInvalidOptionError extends InvalidUsageErrorBase<RetryInvalidOptionErrorMeta> {
  static {
    this.prototype.name = "RetryInvalidOptionError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#errors)
   */
  public constructor(args: RetryInvalidOptionErrorArgs) {
    const { name, actual, ...options } = args;
    const meta: RetryInvalidOptionErrorMeta = {
      name,
      actual,
    };
    super(
      meta,
      ({ name: messageName, actual: messageActual }) =>
        `Invalid Retry option ${JSON.stringify(messageName)}: ${formatActual(messageActual)}`,
      options,
    );
  }
}

setErrorMessage(
  RetryInvalidOptionError,
  ({ name, actual }) => `無効な Retry オプション ${JSON.stringify(name)}: ${formatActual(actual)}`,
  "ja",
);

/**
 * 委譲先のストレージが操作を実装していないときのメタ情報です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#errors)
 */
export type RetryUnsupportedOperationErrorMeta = {
  /**
   * 実装されていない操作名です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#errors)
   */
  readonly operation: string;

  /**
   * 委譲先のストレージ名です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#errors)
   */
  readonly storage: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#errors)
 */
export type RetryUnsupportedOperationErrorArgs = ErrorOptions & RetryUnsupportedOperationErrorMeta;

/**
 * 委譲先のストレージが操作を実装していないときのエラーです。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#errors)
 */
export class RetryUnsupportedOperationError extends InvalidUsageErrorBase<RetryUnsupportedOperationErrorMeta> {
  static {
    this.prototype.name = "RetryUnsupportedOperationError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#errors)
   */
  public constructor(args: RetryUnsupportedOperationErrorArgs) {
    const { storage, operation, ...options } = args;
    const meta: RetryUnsupportedOperationErrorMeta = {
      storage,
      operation,
    };
    super(
      meta,
      ({ storage: messageStorage, operation: messageOperation }) =>
        `Storage ${JSON.stringify(messageStorage)} does not support ${messageOperation}.`,
      options,
    );
  }
}

setErrorMessage(
  RetryUnsupportedOperationError,
  ({ storage, operation }) =>
    `ストレージ ${JSON.stringify(storage)} は ${operation} をサポートしていません。`,
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
