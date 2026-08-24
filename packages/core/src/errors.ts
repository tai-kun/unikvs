import { type ErrorMeta, I18nErrorBase, setErrorMessage, type ErrorOptions } from "i18n-error-base";

// -------------------------------------------------------------------------------------------------
//
// ユーティリティー
//
// -------------------------------------------------------------------------------------------------

/**
 * エラークラスに、言語ごとのエラーメッセージを登録します。
 *
 * 登録できるメッセージは固定文字列か、メタ情報を受け取って文字列を返す関数です。
 * 言語は 1 つの言語タグか、複数の言語タグを列挙した反復可能オブジェクトで指定します。
 *
 * @param reference メッセージを登録する対象のエラークラスです。
 * @param message 登録するメッセージ、またはメタ情報からメッセージを生成する関数です。
 * @param lang メッセージを使用する言語タグ、または言語タグの反復可能オブジェクトです。
 */
export { setErrorMessage };

/**
 * エラーが保持するメタ情報の型定義です。
 *
 * キーを string、値を unknown として扱う読み取り専用のオブジェクトです。
 */
export type { ErrorMeta };

/**
 * エラーのコンストラクターに渡せるオプションの型定義です。
 *
 * - `cause`: エラーの原因となった値です。
 */
export type { ErrorOptions };

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
 * import { ErrorBase, setErrorMessage, type ErrorOptions } from "@unikvs/core";
 *
 * type KeyNotFoundErrorMeta = { readonly key: string };
 * type KeyNotFoundErrorArgs = ErrorOptions & KeyNotFoundErrorMeta;
 *
 * class KeyNotFoundError extends ErrorBase<KeyNotFoundErrorMeta> {
 *   static {
 *     this.prototype.name = "MemoryKeyNotFoundError";
 *   }
 *
 *   public constructor(args: KeyNotFoundErrorArgs) {
 *     const { key, ...options } = args;
 *     const meta: KeyNotFoundErrorMeta = { key };
 *     super(meta, ({ key }) => `Key not found: ${key}`, options);
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
 * type InvalidInputErrorArgs = ErrorOptions & InvalidInputErrorMeta;
 *
 * class InvalidInputError extends InvalidUsageErrorBase<InvalidInputErrorMeta> {
 *   static {
 *     this.prototype.name = "UniKvsInvalidInputError";
 *   }
 *
 *   public constructor(args: InvalidInputErrorArgs) {
 *     const { key, actual, ...options } = args;
 *     const meta: InvalidInputErrorMeta = { key, actual };
 *     super(meta, ({ key, actual }) => `Invalid input for key "${key}": ${actual}`, options);
 *   }
 * }
 *
 * throw new InvalidInputError({ key: "foo", actual: 42 });
 * ```
 */
export class InvalidUsageErrorBase<
  TMeta extends ErrorMeta | undefined = ErrorMeta | undefined,
> extends ErrorBase<TMeta> {}
