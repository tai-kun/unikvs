import { type ErrorOptions, ErrorBase, setErrorMessage } from "@unikvs/core";
import getTypeName from "type-name";

export type { KeyNotFoundErrorArgs, KeyNotFoundErrorMeta } from "@unikvs/core";
export { KeyNotFoundError } from "@unikvs/core";

export type { StorageAbortedErrorArgs, StorageAbortedErrorMeta } from "@unikvs/core";
export { StorageAbortedError } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#error-invalid-chunk-type)
 */
export type InvalidChunkTypeErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#error-invalid-chunk-type)
   */
  readonly key: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#error-invalid-chunk-type)
   */
  readonly chunk: unknown;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#error-invalid-chunk-type)
   */
  readonly chunkType: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#error-invalid-chunk-type)
 */
export type InvalidChunkTypeErrorArgs = ErrorOptions & Omit<InvalidChunkTypeErrorMeta, "chunkType">;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#error-invalid-chunk-type)
 */
export class InvalidChunkTypeError extends ErrorBase<InvalidChunkTypeErrorMeta> {
  static {
    this.prototype.name = "CloudflareR2InvalidChunkTypeError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#error-invalid-chunk-type)
   */
  public constructor(args: InvalidChunkTypeErrorArgs) {
    const { key, chunk, ...options } = args;
    const meta: InvalidChunkTypeErrorMeta = {
      key,
      chunk,
      chunkType: getTypeName(chunk),
    };
    super(
      meta,
      ({ key: messageKey, chunkType }) =>
        `Expected chunk for key ${JSON.stringify(messageKey)} is Uint8Array<ArrayBuffer>, but got ${chunkType}`,
      options,
    );
  }
}

setErrorMessage(
  InvalidChunkTypeError,
  ({ key: messageKey, chunkType }) =>
    `キー ${JSON.stringify(messageKey)} のチャンク型に Uint8Array<ArrayBuffer> を期待しましたが、${chunkType} を得ました`,
  "ja",
);
