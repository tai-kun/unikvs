import { ErrorBase, setErrorMessage, type ErrorOptions } from "@unikvs/core";
import { inspect } from "inspect-lite";

/**
 * {@link ChecksumMismatchError} のメタデータです。
 */
export type ChecksumMismatchErrorMeta = {
  /**
   * 実際に計算されたハッシュ値です。
   */
  readonly actual: string;

  /**
   * 期待されたハッシュ値です。
   */
  readonly expected: string;
};

/**
 * {@link ChecksumMismatchError} のコンストラクター引数です。
 *
 * エラーの追加情報 (`cause`) も含みます。
 */
export type ChecksumMismatchErrorArgs = ErrorOptions & ChecksumMismatchErrorMeta;

/**
 * 計算されたハッシュ値が期待されたハッシュ値と一致しない場合に投げられるエラーです。
 */
export class ChecksumMismatchError extends ErrorBase<ChecksumMismatchErrorMeta> {
  static {
    this.prototype.name = "UniKvsChecksumMismatchError";
  }

  /**
   * ChecksumMismatchError の新しいインスタンスを初期化します。
   *
   * @param args 実際のハッシュ値、期待されたハッシュ値、エラーの追加情報を含む引数です。
   */
  public constructor(args: ChecksumMismatchErrorArgs) {
    const { actual, expected, ...options } = args;
    const meta: ChecksumMismatchErrorMeta = { actual, expected };
    super(meta, ({ actual, expected }) => `Expected ${expected}, but got ${actual}`, options);
  }
}

setErrorMessage(
  ChecksumMismatchError,
  ({ actual, expected }) => `${expected} を期待しましたが、${actual} を得ました`,
  "ja",
);

/**
 * {@link ChecksumInvalidVarNameError} のメタデータです。
 */
export type ChecksumInvalidVarNameErrorMeta = {
  /**
   * 無効な変数キーの値です。
   */
  readonly actual: unknown;
};

/**
 * {@link ChecksumInvalidVarNameError} のコンストラクター引数です。
 *
 * エラーの追加情報 (`cause`) も含みます。
 */
export type ChecksumInvalidVarNameErrorArgs = ErrorOptions & ChecksumInvalidVarNameErrorMeta;

/**
 * 変数キーが不正な場合に投げられるエラーです。
 *
 * CHECKSUM_VAR_NAME が文字列ではない場合に発生します。
 */
export class ChecksumInvalidVarNameError extends ErrorBase<ChecksumInvalidVarNameErrorMeta> {
  static {
    this.prototype.name = "UniKvsChecksumInvalidVarNameError";
  }

  /**
   * ChecksumInvalidVarNameError の新しいインスタンスを初期化します。
   *
   * @param args 実際のキー値とエラーの追加情報を含む引数です。
   */
  public constructor(args: ChecksumInvalidVarNameErrorArgs) {
    const { actual, ...options } = args;
    const meta: ChecksumInvalidVarNameErrorMeta = { actual };
    super(meta, ({ actual }) => `Invalid vars key: ${inspect(actual)}`, options);
  }
}

setErrorMessage(
  ChecksumInvalidVarNameError,
  ({ actual }) => `無効な変数キー: ${inspect(actual)}`,
  "ja",
);

/**
 * チェックサムが必須であるにもかかわらず、変数にチェックサムが指定されていない場合に投げられるエラーです。
 */
export class ChecksumRequiredError extends ErrorBase<undefined> {
  static {
    this.prototype.name = "ChecksumRequiredError";
  }

  /**
   * ChecksumRequiredError の新しいインスタンスを初期化します。
   *
   * @param options エラーオプションです。
   */
  public constructor(options?: ErrorOptions) {
    super("Checksum is required", options);
  }
}

setErrorMessage(ChecksumRequiredError, "チェックサムは必須です", "ja");
