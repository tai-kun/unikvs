import { ErrorBase, setErrorMessage, type ErrorOptions } from "@unikvs/core";

/**
 * {@link InvalidFilenameError} のメタデータです。
 */
export type InvalidFilenameErrorMeta = {
  /**
   * 無効だったファイル名です。
   */
  readonly filename: string;
};

/**
 * {@link InvalidFilenameError} のコンストラクター引数です。
 *
 * エラーの追加情報 (`cause`) も含みます。
 */
export type InvalidFilenameErrorArgs = ErrorOptions & InvalidFilenameErrorMeta;

/**
 * ファイル名として使用できない文字列が指定された場合に投げられるエラーです。
 */
export class InvalidFilenameError extends ErrorBase<InvalidFilenameErrorMeta> {
  static {
    this.prototype.name = "UniKvsInvalidFilenameError";
  }

  /**
   * InvalidFilenameError の新しいインスタンスを初期化します。
   *
   * @param args 無効だったファイル名とエラーの追加情報を含む引数です。
   */
  public constructor(args: InvalidFilenameErrorArgs) {
    const { filename, ...options } = args;
    const meta: InvalidFilenameErrorMeta = { filename };
    super(meta, ({ filename }) => `Invalid file name: ${filename}`, options);
  }
}

setErrorMessage(InvalidFilenameError, ({ filename }) => `無効なファイル名: ${filename}`, "ja");

/**
 * {@link InvalidDirnameError} のメタデータです。
 */
export type InvalidDirnameErrorMeta = {
  /**
   * 無効だったディレクトリー名です。
   */
  readonly dirname: string;
};

/**
 * {@link InvalidDirnameError} のコンストラクター引数です。
 *
 * エラーの追加情報 (`cause`) も含みます。
 */
export type InvalidDirnameErrorArgs = ErrorOptions & InvalidDirnameErrorMeta;

/**
 * ディレクトリー名として使用できない文字列が指定された場合に投げられるエラーです。
 */
export class InvalidDirnameError extends ErrorBase<InvalidDirnameErrorMeta> {
  static {
    this.prototype.name = "UniKvsInvalidDirnameError";
  }

  /**
   * InvalidDirnameError の新しいインスタンスを初期化します。
   *
   * @param args 無効だったディレクトリー名とエラーの追加情報を含む引数です。
   */
  public constructor(args: InvalidDirnameErrorArgs) {
    const { dirname, ...options } = args;
    const meta: InvalidDirnameErrorMeta = { dirname };
    super(meta, ({ dirname }) => `Invalid directory name: ${dirname}`, options);
  }
}

setErrorMessage(InvalidDirnameError, ({ dirname }) => `無効なディレクトリー名: ${dirname}`, "ja");
