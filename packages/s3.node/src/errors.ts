import { ErrorBase, type ErrorOptions, setErrorMessage } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-node#errors)
 */
export type InvalidPartSizeErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-node#errors)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-node#errors)
 */
export type InvalidPartSizeErrorArgs = ErrorOptions & InvalidPartSizeErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-node#errors)
 */
export class InvalidPartSizeError extends ErrorBase<InvalidPartSizeErrorMeta> {
  static {
    this.prototype.name = "S3InvalidPartSizeError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-node#errors)
   */
  public constructor(args: InvalidPartSizeErrorArgs) {
    const { actual, ...options } = args;
    const meta: InvalidPartSizeErrorMeta = { actual };
    super(
      meta,
      ({ actual }) =>
        `Invalid part size ${String(actual)} was specified in the vars. A non-integer or non-positive value cannot be used as a multipart upload part size, causing unpredictable upload behavior. Specify a positive integer in bytes such as ${5 * 1024 * 1024}.`,
      options,
    );
  }
}

setErrorMessage(
  InvalidPartSizeError,
  ({ actual }) =>
    `変数に無効なパートサイズ ${String(actual)} が指定されました。整数でも正数でもない値はマルチパートアップロードのパートサイズとして使用できず、予測できない挙動を引き起こします。${5 * 1024 * 1024} などの正の整数 (バイト単位) を指定してください`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-node#errors)
 */
export type StorageAbortedErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-node#errors)
   */
  readonly key: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-node#errors)
 */
export type StorageAbortedErrorArgs = ErrorOptions & StorageAbortedErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-node#errors)
 */
export class StorageAbortedError extends ErrorBase<StorageAbortedErrorMeta> {
  static {
    this.prototype.name = "S3StorageAbortedError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-node#errors)
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
