import { type ErrorOptions, ErrorBase, setErrorMessage } from "@unikvs/core";
import getTypeName from "type-name";

export type { KeyNotFoundErrorArgs, KeyNotFoundErrorMeta } from "@unikvs/core";
export { KeyNotFoundError } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#invalid-chunk-type-error)
 */
export type InvalidChunkTypeErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#invalid-chunk-type-key)
   */
  readonly key: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#invalid-chunk-type-chunk)
   */
  readonly chunk: unknown;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#invalid-chunk-type-chunk-type)
   */
  readonly chunkType: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#invalid-chunk-type-error)
 */
export type InvalidChunkTypeErrorArgs = ErrorOptions & Omit<InvalidChunkTypeErrorMeta, "chunkType">;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#invalid-chunk-type-error)
 */
export class InvalidChunkTypeError extends ErrorBase<InvalidChunkTypeErrorMeta> {
  static {
    this.prototype.name = "LruCacheInvalidChunkTypeError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#invalid-chunk-type-error)
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

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#invalid-max-entries-error)
 */
export type InvalidMaxEntriesErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#invalid-max-entries-actual)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#invalid-max-entries-error)
 */
export type InvalidMaxEntriesErrorArgs = ErrorOptions & InvalidMaxEntriesErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#invalid-max-entries-error)
 */
export class InvalidMaxEntriesError extends ErrorBase<InvalidMaxEntriesErrorMeta> {
  static {
    this.prototype.name = "LruCacheInvalidMaxEntriesError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#invalid-max-entries-error)
   */
  public constructor(args: InvalidMaxEntriesErrorArgs) {
    const { actual, ...options } = args;
    const meta: InvalidMaxEntriesErrorMeta = { actual };
    super(
      meta,
      ({ actual: messageActual }) =>
        `maxEntries must be an integer >= 0, but got ${String(messageActual)}`,
      options,
    );
  }
}

setErrorMessage(
  InvalidMaxEntriesError,
  ({ actual: messageActual }) =>
    `maxEntries は 0 以上の整数でなければなりません。受け取った値: ${String(messageActual)}`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#invalid-max-bytes-error)
 */
export type InvalidMaxBytesErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#invalid-max-bytes-actual)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#invalid-max-bytes-error)
 */
export type InvalidMaxBytesErrorArgs = ErrorOptions & InvalidMaxBytesErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#invalid-max-bytes-error)
 */
export class InvalidMaxBytesError extends ErrorBase<InvalidMaxBytesErrorMeta> {
  static {
    this.prototype.name = "LruCacheInvalidMaxBytesError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#invalid-max-bytes-error)
   */
  public constructor(args: InvalidMaxBytesErrorArgs) {
    const { actual, ...options } = args;
    const meta: InvalidMaxBytesErrorMeta = { actual };
    super(
      meta,
      ({ actual: messageActual }) =>
        `maxBytes must be a finite number >= 0, but got ${String(messageActual)}`,
      options,
    );
  }
}

setErrorMessage(
  InvalidMaxBytesError,
  ({ actual: messageActual }) =>
    `maxBytes は 0 以上の有限数でなければなりません。受け取った値: ${String(messageActual)}`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#invalid-size-of-result-error)
 */
export type InvalidSizeOfResultErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#invalid-size-of-result-key)
   */
  readonly key: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#invalid-size-of-result-actual)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#invalid-size-of-result-error)
 */
export type InvalidSizeOfResultErrorArgs = ErrorOptions & InvalidSizeOfResultErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#invalid-size-of-result-error)
 */
export class InvalidSizeOfResultError extends ErrorBase<InvalidSizeOfResultErrorMeta> {
  static {
    this.prototype.name = "LruCacheInvalidSizeOfResultError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#invalid-size-of-result-error)
   */
  public constructor(args: InvalidSizeOfResultErrorArgs) {
    const { key, actual, ...options } = args;
    const meta: InvalidSizeOfResultErrorMeta = {
      key,
      actual,
    };
    super(
      meta,
      ({ key: messageKey, actual: messageActual }) =>
        `sizeOf must return a finite number >= 0 for key ${JSON.stringify(messageKey)}, but got ${String(messageActual)}`,
      options,
    );
  }
}

setErrorMessage(
  InvalidSizeOfResultError,
  ({ key: messageKey, actual: messageActual }) =>
    `キー ${JSON.stringify(messageKey)} の sizeOf は 0 以上の有限数を返さなければなりません。受け取った値: ${String(messageActual)}`,
  "ja",
);
