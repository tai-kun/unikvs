import { type ErrorOptions, ErrorBase, setErrorMessage } from "@unikvs/core";
import getTypeName from "type-name";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/indexeddb#invalid-chunk-type-error)
 */
export type InvalidChunkTypeErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/indexeddb#invalid-chunk-type-key)
   */
  readonly key: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/indexeddb#invalid-chunk-type-chunk)
   */
  readonly chunk: unknown;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/indexeddb#invalid-chunk-type-chunk-type)
   */
  readonly chunkType: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/indexeddb#invalid-chunk-type-error)
 */
export type InvalidChunkTypeErrorArgs = ErrorOptions & Omit<InvalidChunkTypeErrorMeta, "chunkType">;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/indexeddb#invalid-chunk-type-error)
 */
export class InvalidChunkTypeError extends ErrorBase<InvalidChunkTypeErrorMeta> {
  static {
    this.prototype.name = "IndexeddbInvalidChunkTypeError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/indexeddb#invalid-chunk-type-error)
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
        `Expected chunk for key ${JSON.stringify(messageKey)} is Uint8Array, but got ${chunkType}`,
      options,
    );
  }
}

setErrorMessage(
  InvalidChunkTypeError,
  ({ key: messageKey, chunkType }) =>
    `キー ${JSON.stringify(messageKey)} のチャンク型に Uint8Array を期待しましたが、${chunkType} を得ました`,
  "ja",
);
