import { type ErrorOptions, ErrorBase, setErrorMessage } from "@unikvs/core";
import getTypeName from "type-name";

export type { KeyNotFoundErrorArgs, KeyNotFoundErrorMeta } from "@unikvs/core";
export { KeyNotFoundError } from "@unikvs/core";

export type { StorageAbortedErrorArgs, StorageAbortedErrorMeta } from "@unikvs/core";
export { StorageAbortedError } from "@unikvs/core";

/**
 * チャンクの型が不正なときのメタ情報です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#error-invalid-chunk-type)
 */
export type InvalidChunkTypeErrorMeta = {
  /**
   * 書き込み対象のキーです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#error-invalid-chunk-type)
   */
  readonly key: string;

  /**
   * 受け取ったチャンクです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#error-invalid-chunk-type)
   */
  readonly chunk: unknown;

  /**
   * 受け取ったチャンクの型名です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#error-invalid-chunk-type)
   */
  readonly chunkType: string;
};

/**
 * チャンクの型が不正なときの引数です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#error-invalid-chunk-type)
 */
export type InvalidChunkTypeErrorArgs = ErrorOptions & Omit<InvalidChunkTypeErrorMeta, "chunkType">;

/**
 * チャンクが `Uint8Array<ArrayBuffer>` ではないときに投げます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#error-invalid-chunk-type)
 */
export class InvalidChunkTypeError extends ErrorBase<InvalidChunkTypeErrorMeta> {
  static {
    this.prototype.name = "CloudflareR2InvalidChunkTypeError";
  }

  /**
   * チャンクが `Uint8Array<ArrayBuffer>` ではないときに投げます。
   *
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
