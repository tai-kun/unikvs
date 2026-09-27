import { ErrorBase, type ErrorOptions, setErrorMessage } from "@unikvs/core";
import getTypeName from "type-name";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/memory#errors)
 */
export type KeyNotFoundErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memory#errors)
   */
  readonly key: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/memory#errors)
 */
export type KeyNotFoundErrorArgs = ErrorOptions & KeyNotFoundErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/memory#errors)
 */
export class KeyNotFoundError extends ErrorBase<KeyNotFoundErrorMeta> {
  static {
    this.prototype.name = "MemoryKeyNotFoundError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memory#errors)
   */
  public constructor(args: KeyNotFoundErrorArgs) {
    const { key, ...options } = args;
    const meta: KeyNotFoundErrorMeta = { key };
    super(meta, ({ key }) => `Key not found: ${key}`, options);
  }
}

setErrorMessage(KeyNotFoundError, ({ key }) => `キー ${key} が見つかりません`, "ja");

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/memory#errors)
 */
export type InvalidChunkTypeErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memory#errors)
   */
  readonly key: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memory#errors)
   */
  readonly chunk: unknown;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memory#errors)
   */
  readonly chunkType: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/memory#errors)
 */
export type InvalidChunkTypeErrorArgs = ErrorOptions & Omit<InvalidChunkTypeErrorMeta, "chunkType">;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/memory#errors)
 */
export class InvalidChunkTypeError extends ErrorBase<InvalidChunkTypeErrorMeta> {
  static {
    this.prototype.name = "MemoryInvalidChunkTypeError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memory#errors)
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
