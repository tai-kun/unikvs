import { ErrorBase, InvalidUsageErrorBase, type ErrorOptions, setErrorMessage } from "@unikvs/core";
import getTypeName from "type-name";

export type { KeyNotFoundErrorArgs, KeyNotFoundErrorMeta } from "@unikvs/core";
export { KeyNotFoundError } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cache-storage#errors)
 */
export class CacheStorageNotAvailableError extends InvalidUsageErrorBase<undefined> {
  static {
    this.prototype.name = "CacheStorageNotAvailableError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cache-storage#errors)
   */
  public constructor(options?: ErrorOptions) {
    super(
      "Cache API is not available in this environment. Inject a CacheStorage via options.caches.",
      options,
    );
  }
}

setErrorMessage(
  CacheStorageNotAvailableError,
  "この環境では Cache API を利用できません。options.caches に CacheStorage を注入してください。",
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cache-storage#errors)
 */
export type InvalidChunkTypeErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cache-storage#errors)
   */
  readonly key: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cache-storage#errors)
   */
  readonly chunk: unknown;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cache-storage#errors)
   */
  readonly chunkType: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cache-storage#errors)
 */
export type InvalidChunkTypeErrorArgs = ErrorOptions & Omit<InvalidChunkTypeErrorMeta, "chunkType">;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cache-storage#errors)
 */
export class InvalidChunkTypeError extends ErrorBase<InvalidChunkTypeErrorMeta> {
  static {
    this.prototype.name = "CacheStorageInvalidChunkTypeError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cache-storage#errors)
   */
  public constructor(args: InvalidChunkTypeErrorArgs) {
    const { key, chunk, ...options } = args;
    const meta: InvalidChunkTypeErrorMeta = { key, chunk, chunkType: getTypeName(chunk) };
    super(
      meta,
      ({ key, chunkType }) =>
        `Expected chunk for key ${JSON.stringify(key)} is Uint8Array<ArrayBuffer>, but got ${chunkType}`,
      options,
    );
  }
}

setErrorMessage(
  InvalidChunkTypeError,
  ({ key, chunkType }) =>
    `キー ${JSON.stringify(key)} のチャンク型に Uint8Array<ArrayBuffer> を期待しましたが、${chunkType} を得ました`,
  "ja",
);
