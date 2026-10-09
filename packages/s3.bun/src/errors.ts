import { InvalidUsageErrorBase, type ErrorOptions, setErrorMessage } from "@unikvs/core";

export type { InvalidPartSizeErrorArgs, InvalidPartSizeErrorMeta } from "@unikvs/core";
export { InvalidPartSizeError } from "@unikvs/core";
export type { StorageAbortedErrorArgs, StorageAbortedErrorMeta } from "@unikvs/core";
export { StorageAbortedError } from "@unikvs/core";
export type { UnsupportedRuntimeErrorArgs, UnsupportedRuntimeErrorMeta } from "@unikvs/core";
export { UnsupportedRuntimeError } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-bun#errors)
 */
export class StorageNotOpenError extends InvalidUsageErrorBase<undefined> {
  static {
    this.prototype.name = "S3StorageNotOpenError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-bun#errors)
   */
  public constructor(options?: ErrorOptions) {
    super("The S3 client is not open. Call open() before close().", options);
  }
}

setErrorMessage(
  StorageNotOpenError,
  "S3 クライアントがオープンされていません。close() の前に open() を呼び出してください",
  "ja",
);
