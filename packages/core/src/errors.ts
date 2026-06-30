import { type ErrorMeta, I18nErrorBase, setErrorMessage, type ErrorOptions } from "i18n-error-base";

// -------------------------------------------------------------------------------------------------
//
// ユーティリティー
//
// -------------------------------------------------------------------------------------------------

export { setErrorMessage };
export type { ErrorMeta, ErrorOptions };

// -------------------------------------------------------------------------------------------------
//
// 基本
//
// -------------------------------------------------------------------------------------------------

/**
 * unikvs の全エラーの基底クラスです。
 *
 * @example
 * メタ情報を持つエラーを定義します。
 *
 * ```ts
 * import { ErrorBase, type ErrorOptions, setErrorMessage } from "@unikvs/core";
 *
 * type KeyNotFoundErrorMeta = { readonly key: string };
 * type KeyNotFoundErrorArgs = KeyNotFoundErrorMeta;
 *
 * class KeyNotFoundError extends ErrorBase<KeyNotFoundErrorMeta> {
 *   static {
 *     this.prototype.name = "MemoryKeyNotFoundError";
 *   }
 *
 *   public constructor(args: KeyNotFoundErrorArgs, options?: ErrorOptions) {
 *     super(args, ({ key }) => `Key not found: ${key}`, options);
 *   }
 * }
 *
 * setErrorMessage(KeyNotFoundError, ({ key }) => `キー ${key} が見つかりません`, "ja");
 *
 * throw new KeyNotFoundError({ key: "foo" });
 * ```
 *
 * @example
 * メタ情報が不要なエラーを定義します。
 *
 * ```ts
 * import { ErrorBase, type ErrorOptions, setErrorMessage } from "@unikvs/core";
 *
 * class ChecksumRequiredError extends ErrorBase<undefined> {
 *   static {
 *     this.prototype.name = "ChecksumRequiredError";
 *   }
 *
 *   public constructor(options?: ErrorOptions) {
 *     super("Checksum is required", options);
 *   }
 * }
 *
 * setErrorMessage(ChecksumRequiredError, "チェックサムは必須です", "ja");
 *
 * throw new ChecksumRequiredError();
 * ```
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
 * 無効な使用方法（API 契約違反）を示すエラーの基底クラスです。
 *
 * @example
 * ```ts
 * import { InvalidUsageErrorBase, type ErrorOptions } from "@unikvs/core";
 *
 * type InvalidInputErrorMeta = { readonly key: string; readonly actual: unknown };
 * type InvalidInputErrorArgs = InvalidInputErrorMeta;
 *
 * class InvalidInputError extends InvalidUsageErrorBase<InvalidInputErrorMeta> {
 *   static {
 *     this.prototype.name = "UniKvsInvalidInputError";
 *   }
 *
 *   public constructor(args: InvalidInputErrorArgs, options?: ErrorOptions) {
 *     super(args, ({ key, actual }) => `Invalid input for key "${key}": ${actual}`, options);
 *   }
 * }
 *
 * throw new InvalidInputError({ key: "foo", actual: 42 });
 * ```
 */
export class InvalidUsageErrorBase<
  TMeta extends ErrorMeta | undefined = ErrorMeta | undefined,
> extends ErrorBase<TMeta> {}
