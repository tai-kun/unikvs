import { type ErrorMeta, I18nErrorBase, setErrorMessage, type ErrorOptions } from "i18n-error-base";

// -------------------------------------------------------------------------------------------------
//
// ユーティリティー
//
// -------------------------------------------------------------------------------------------------

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#errors-message)
 */
export { setErrorMessage };

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#errors)
 */
export type { ErrorMeta };

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#errors)
 */
export type { ErrorOptions };

// -------------------------------------------------------------------------------------------------
//
// 基本
//
// -------------------------------------------------------------------------------------------------

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#errors-base)
 */
export class ErrorBase<
  TMeta extends ErrorMeta | undefined = ErrorMeta | undefined,
> extends I18nErrorBase<TMeta> {}

// -------------------------------------------------------------------------------------------------
//
// 境界エラー
//
// -------------------------------------------------------------------------------------------------

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#errors-invalid-usage)
 */
export class InvalidUsageErrorBase<
  TMeta extends ErrorMeta | undefined = ErrorMeta | undefined,
> extends ErrorBase<TMeta> {}

// -------------------------------------------------------------------------------------------------
//
// 書き戻しの拒否
//
// -------------------------------------------------------------------------------------------------

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#errors)
 */
export type RepairNotAllowedErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#errors)
   */
  readonly name: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#errors)
 */
export type RepairNotAllowedErrorArgs = ErrorOptions & RepairNotAllowedErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#errors)
 */
export class RepairNotAllowedError extends ErrorBase<RepairNotAllowedErrorMeta> {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#errors)
   */
  public constructor(args: RepairNotAllowedErrorArgs) {
    const { name, ...options } = args;
    const meta: RepairNotAllowedErrorMeta = { name };
    super(meta, ({ name }) => `Storage "${name}" does not allow repair writes`, options);
  }
}

setErrorMessage(
  RepairNotAllowedError,
  ({ name }) => `ストレージ "${name}" は書き戻しを許可していません`,
  "ja",
);
