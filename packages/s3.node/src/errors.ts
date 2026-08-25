import { ErrorBase, type ErrorOptions, setErrorMessage } from "@unikvs/core";

/**
 * コンテキストに指定されたパートサイズが正の整数ではないことを示すエラーメタデータ型です。
 */
export type InvalidPartSizeErrorMeta = {
  /**
   * 実際に指定されたパートサイズの値です。
   */
  readonly actual: unknown;
};

/**
 * {@link InvalidPartSizeError} のコンストラクター引数型です。
 *
 * エラーの追加情報 (`cause`) も含みます。
 */
export type InvalidPartSizeErrorArgs = ErrorOptions & InvalidPartSizeErrorMeta;

/**
 * コンテキストに正の整数ではないパートサイズが指定された場合に投げられるエラーです。
 */
export class InvalidPartSizeError extends ErrorBase<InvalidPartSizeErrorMeta> {
  static {
    this.prototype.name = "S3InvalidPartSizeError";
  }

  /**
   * InvalidPartSizeError インスタンスを初期化します。
   *
   * @param args エラーメタデータとエラーの追加情報です。
   */
  public constructor(args: InvalidPartSizeErrorArgs) {
    const { actual, ...options } = args;
    const meta: InvalidPartSizeErrorMeta = { actual };
    super(
      meta,
      ({ actual }) =>
        `Invalid part size ${String(actual)} was specified in the context. A non-integer or non-positive value cannot be used as a multipart upload part size, causing unpredictable upload behavior. Specify a positive integer in bytes such as ${5 * 1024 * 1024}.`,
      options,
    );
  }
}

setErrorMessage(
  InvalidPartSizeError,
  ({ actual }) =>
    `コンテキストに無効なパートサイズ ${String(actual)} が指定されました。整数でも正数でもない値はマルチパートアップロードのパートサイズとして使用できず、予測できない挙動を引き起こします。${5 * 1024 * 1024} などの正の整数 (バイト単位) を指定してください`,
  "ja",
);

/**
 * 書き込みストリームの取得前に操作が中断されたことを示すエラーメタデータ型です。
 */
export type StorageAbortedErrorMeta = {
  /**
   * 書き込み先のキーです。
   */
  readonly key: string;
};

/**
 * {@link StorageAbortedError} のコンストラクター引数型です。
 *
 * エラーの追加情報 (`cause`) も含みます。
 */
export type StorageAbortedErrorArgs = ErrorOptions & StorageAbortedErrorMeta;

/**
 * 中断済みのシグナルと共に書き込みストリームが要求された場合に投げられるエラーです。
 */
export class StorageAbortedError extends ErrorBase<StorageAbortedErrorMeta> {
  static {
    this.prototype.name = "S3StorageAbortedError";
  }

  /**
   * StorageAbortedError インスタンスを初期化します。
   *
   * @param args エラーメタデータとエラーの追加情報です。
   */
  public constructor(args: StorageAbortedErrorArgs) {
    const { key, ...options } = args;
    const meta: StorageAbortedErrorMeta = { key };
    super(
      meta,
      ({ key }) =>
        `The upload for key ${JSON.stringify(key)} was aborted before it started because the given abort signal was already signaled. Starting an upload with an already aborted signal can never succeed, so it is rejected immediately. Pass a signal that is not aborted, or check the signal state before requesting a writable stream.`,
      options,
    );
  }
}

setErrorMessage(
  StorageAbortedError,
  ({ key }) =>
    `キー ${JSON.stringify(key)} のアップロードは、渡された中断シグナルが既に中断されているため開始前に中止されました。既に中断済みのシグナルではアップロードを成功させられないため、即座に拒否されます。中断されていないシグナルを渡すか、書き込みストリームを要求する前にシグナルの状態を確認してください`,
  "ja",
);
