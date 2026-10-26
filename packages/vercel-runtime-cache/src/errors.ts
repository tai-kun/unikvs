import { type ErrorOptions, ErrorBase, setErrorMessage, InvalidUsageErrorBase } from "@unikvs/core";
import getTypeName from "type-name";

export type { KeyNotFoundErrorArgs, KeyNotFoundErrorMeta } from "@unikvs/core";
export { KeyNotFoundError } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#error-invalid-chunk-type)
 */
export type InvalidChunkTypeErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#error-invalid-chunk-type)
   */
  readonly key: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#error-invalid-chunk-type)
   */
  readonly chunk: unknown;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#error-invalid-chunk-type)
   */
  readonly chunkType: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#error-invalid-chunk-type)
 */
export type InvalidChunkTypeErrorArgs = ErrorOptions & Omit<InvalidChunkTypeErrorMeta, "chunkType">;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#error-invalid-chunk-type)
 */
export class InvalidChunkTypeError extends ErrorBase<InvalidChunkTypeErrorMeta> {
  static {
    this.prototype.name = "VercelRuntimeCacheInvalidChunkTypeError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#error-invalid-chunk-type)
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
  ({ key, chunkType }) =>
    `キー ${JSON.stringify(key)} のチャンク型に Uint8Array<ArrayBuffer> を期待しましたが、${chunkType} を得ました`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#error-invalid-ttl-seconds)
 */
export type InvalidTtlSecondsErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#error-invalid-ttl-seconds)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#error-invalid-ttl-seconds)
 */
export type InvalidTtlSecondsErrorArgs = ErrorOptions & InvalidTtlSecondsErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#error-invalid-ttl-seconds)
 */
export class InvalidTtlSecondsError extends InvalidUsageErrorBase<InvalidTtlSecondsErrorMeta> {
  static {
    this.prototype.name = "VercelRuntimeCacheInvalidTtlSecondsError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#error-invalid-ttl-seconds)
   */
  public constructor(args: InvalidTtlSecondsErrorArgs) {
    const { actual, ...options } = args;
    const meta: InvalidTtlSecondsErrorMeta = { actual };
    super(
      meta,
      ({ actual: messageActual }) =>
        `ttlSeconds must be a finite number > 0, but got ${String(messageActual)}`,
      options,
    );
  }
}

setErrorMessage(
  InvalidTtlSecondsError,
  ({ actual }) =>
    `ttlSeconds は 0 より大きい有限数でなければなりません。受け取った値: ${String(actual)}`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#error-invalid-max-entries)
 */
export type InvalidMaxEntriesErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#error-invalid-max-entries)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#error-invalid-max-entries)
 */
export type InvalidMaxEntriesErrorArgs = ErrorOptions & InvalidMaxEntriesErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#error-invalid-max-entries)
 */
export class InvalidMaxEntriesError extends InvalidUsageErrorBase<InvalidMaxEntriesErrorMeta> {
  static {
    this.prototype.name = "VercelRuntimeCacheInvalidMaxEntriesError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#error-invalid-max-entries)
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
  ({ actual }) => `maxEntries は 0 以上の整数でなければなりません。受け取った値: ${String(actual)}`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#error-invalid-namespace)
 */
export type InvalidNamespaceErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#error-invalid-namespace)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#error-invalid-namespace)
 */
export type InvalidNamespaceErrorArgs = ErrorOptions & InvalidNamespaceErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#error-invalid-namespace)
 */
export class InvalidNamespaceError extends InvalidUsageErrorBase<InvalidNamespaceErrorMeta> {
  static {
    this.prototype.name = "VercelRuntimeCacheInvalidNamespaceError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#error-invalid-namespace)
   */
  public constructor(args: InvalidNamespaceErrorArgs) {
    const { actual, ...options } = args;
    const meta: InvalidNamespaceErrorMeta = { actual };
    super(
      meta,
      ({ actual: messageActual }) => `namespace must be a string, but got ${String(messageActual)}`,
      options,
    );
  }
}

setErrorMessage(
  InvalidNamespaceError,
  ({ actual }) => `namespace は文字列でなければなりません。受け取った値: ${String(actual)}`,
  "ja",
);
