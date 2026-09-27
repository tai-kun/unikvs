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
