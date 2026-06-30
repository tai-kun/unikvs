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
 */
export type ChecksumMismatchErrorArgs = ChecksumMismatchErrorMeta;

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
   * @param args 実際のハッシュ値と期待されたハッシュ値を含む引数です。
   * @param options エラーオプションです。
   */
  public constructor(args: ChecksumMismatchErrorArgs, options?: ErrorOptions) {
    super(args, ({ actual, expected }) => `Expected ${expected}, but got ${actual}`, options);
  }
}

setErrorMessage(
  ChecksumMismatchError,
  ({ actual, expected }) => `${expected} を期待しましたが、${actual} を得ました`,
  "ja",
);

/**
 * {@link ChecksumInvalidContextKeyError} のメタデータです。
 */
export type ChecksumInvalidContextKeyErrorMeta = {
  /**
   * 無効なコンテクストキーの値です。
   */
  readonly actual: unknown;
};

/**
 * {@link ChecksumInvalidContextKeyError} のコンストラクター引数です。
 */
export type ChecksumInvalidContextKeyErrorArgs = ChecksumInvalidContextKeyErrorMeta;

/**
 * コンテクストキーが不正な場合に投げられるエラーです。
 *
 * CHECKSUM_CONTEXT_KEY が文字列ではない場合に発生します。
 */
export class ChecksumInvalidContextKeyError extends ErrorBase<ChecksumInvalidContextKeyErrorMeta> {
  static {
    this.prototype.name = "UniKvsChecksumInvalidContextKeyError";
  }

  /**
   * ChecksumInvalidContextKeyError の新しいインスタンスを初期化します。
   *
   * @param args 実際のキー値を含む引数です。
   * @param options エラーオプションです。
   */
  public constructor(args: ChecksumInvalidContextKeyErrorArgs, options?: ErrorOptions) {
    super(args, ({ actual }) => `Invalid context key: ${inspect(actual)}`, options);
  }
}

setErrorMessage(
  ChecksumInvalidContextKeyError,
  ({ actual }) => `無効なコンテクストキー: ${inspect(actual)}`,
  "ja",
);

/**
 * チェックサムが必須であるにもかかわらず、コンテキストにチェックサムが指定されていない場合に投げられるエラーです。
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
