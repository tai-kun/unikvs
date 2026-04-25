import { type ErrorMeta, I18nErrorBase, setErrorMessage, type ErrorOptions } from "i18n-error-base";

// -------------------------------------------------------------------------------------------------
//
// ユーティリテー
//
// -------------------------------------------------------------------------------------------------

export { setErrorMessage };
export type { ErrorMeta, ErrorOptions };

// -------------------------------------------------------------------------------------------------
//
// 基本
//
// -------------------------------------------------------------------------------------------------

export class ErrorBase<
  TMeta extends ErrorMeta | undefined = ErrorMeta | undefined,
> extends I18nErrorBase<TMeta> {}
