import { type ErrorOptions, ErrorBase, setErrorMessage, InvalidUsageErrorBase } from "@unikvs/core";
import getTypeName from "type-name";

export type { KeyNotFoundErrorArgs, KeyNotFoundErrorMeta } from "@unikvs/core";
export { KeyNotFoundError } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#error-invalid-origin)
 */
export type InvalidOriginErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#error-invalid-origin)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#error-invalid-origin)
 */
export type InvalidOriginErrorArgs = ErrorOptions & InvalidOriginErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#error-invalid-origin)
 */
export class InvalidOriginError extends InvalidUsageErrorBase<InvalidOriginErrorMeta> {
  static {
    this.prototype.name = "CloudflareCacheInvalidOriginError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#error-invalid-origin)
   */
  public constructor(args: InvalidOriginErrorArgs) {
    const { actual, ...options } = args;
    const meta: InvalidOriginErrorMeta = { actual };
    super(
      meta,
      ({ actual: messageActual }) =>
        `\`origin\` must be an absolute URL without query or fragment, but got ${String(messageActual)}`,
      options,
    );
  }
}

setErrorMessage(
  InvalidOriginError,
  ({ actual: messageActual }) =>
    `\`origin\` はクエリー・フラグメントなしの絶対 URL でなければなりません。受け取った値: ${String(messageActual)}`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#error-invalid-key)
 */
export type InvalidKeyErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#error-invalid-key)
   */
  readonly key: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#error-invalid-key)
 */
export type InvalidKeyErrorArgs = ErrorOptions & InvalidKeyErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#error-invalid-key)
 */
export class InvalidKeyError extends InvalidUsageErrorBase<InvalidKeyErrorMeta> {
  static {
    this.prototype.name = "CloudflareCacheInvalidKeyError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#error-invalid-key)
   */
  public constructor(args: InvalidKeyErrorArgs) {
    const { key, ...options } = args;
    const meta: InvalidKeyErrorMeta = { key };
    super(
      meta,
      ({ key: messageKey }) =>
        `Failed to encode key ${JSON.stringify(messageKey)} as a URL path segment`,
      options,
    );
  }
}

setErrorMessage(
  InvalidKeyError,
  ({ key: messageKey }) =>
    `キー ${JSON.stringify(messageKey)} を URL パスセグメントとして符号化できませんでした`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#error-cache-binding-not-found)
 */
export type CacheBindingNotFoundErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#error-cache-binding-not-found)
   */
  readonly property: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#error-cache-binding-not-found)
 */
export type CacheBindingNotFoundErrorArgs = ErrorOptions & CacheBindingNotFoundErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#error-cache-binding-not-found)
 */
export class CacheBindingNotFoundError extends InvalidUsageErrorBase<CacheBindingNotFoundErrorMeta> {
  static {
    this.prototype.name = "CloudflareCacheBindingNotFoundError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#error-cache-binding-not-found)
   */
  public constructor(args: CacheBindingNotFoundErrorArgs) {
    const { property, ...options } = args;
    const meta: CacheBindingNotFoundErrorMeta = { property };
    super(
      meta,
      ({ property: messageProperty }) =>
        `No Cache binding is available. Pass a \`cache\` option or run on a runtime with ${messageProperty}.`,
      options,
    );
  }
}

setErrorMessage(
  CacheBindingNotFoundError,
  ({ property: messageProperty }) =>
    `Cache binding が見つかりません。\`cache\` オプションを渡すか、${messageProperty} が存在するランタイムで実行してください。`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#error-cache-operation)
 */
export type CacheOperationErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#error-cache-operation)
   */
  readonly operation: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#error-cache-operation)
   */
  readonly key: string | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#error-cache-operation)
 */
export type CacheOperationErrorArgs = ErrorOptions & CacheOperationErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#error-cache-operation)
 */
export class CacheOperationError extends ErrorBase<CacheOperationErrorMeta> {
  static {
    this.prototype.name = "CloudflareCacheOperationError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#error-cache-operation)
   */
  public constructor(args: CacheOperationErrorArgs) {
    const { key, operation, ...options } = args;
    const meta: CacheOperationErrorMeta = {
      key,
      operation,
    };
    super(
      meta,
      ({ key: messageKey, operation: messageOperation }) =>
        `Cache ${messageOperation} failed${messageKey === undefined ? "" : ` for key ${JSON.stringify(messageKey)}`}`,
      options,
    );
  }
}

setErrorMessage(
  CacheOperationError,
  ({ key: messageKey, operation: messageOperation }) =>
    `Cache の ${messageOperation} に失敗しました${messageKey === undefined ? "" : ` (キー ${JSON.stringify(messageKey)})`}`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#error-clear-not-supported)
 */
export class ClearNotSupportedError extends InvalidUsageErrorBase<undefined> {
  static {
    this.prototype.name = "CloudflareCacheClearNotSupportedError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#error-clear-not-supported)
   */
  public constructor(options?: ErrorOptions) {
    super(
      "Cache API does not support key enumeration, so clear is not supported. Delete keys one by one instead.",
      options,
    );
  }
}

setErrorMessage(
  ClearNotSupportedError,
  "Cache API はキーの列挙に対応していないため、clear には対応していません。キーを 1 件ずつ削除してください。",
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#error-invalid-chunk-type)
 */
export type InvalidChunkTypeErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#error-invalid-chunk-type)
   */
  readonly key: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#error-invalid-chunk-type)
   */
  readonly chunk: unknown;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#error-invalid-chunk-type)
   */
  readonly chunkType: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#error-invalid-chunk-type)
 */
export type InvalidChunkTypeErrorArgs = ErrorOptions & Omit<InvalidChunkTypeErrorMeta, "chunkType">;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#error-invalid-chunk-type)
 */
export class InvalidChunkTypeError extends ErrorBase<InvalidChunkTypeErrorMeta> {
  static {
    this.prototype.name = "CloudflareCacheInvalidChunkTypeError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#error-invalid-chunk-type)
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
