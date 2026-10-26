import { type ErrorOptions, ErrorBase, setErrorMessage, InvalidUsageErrorBase } from "@unikvs/core";
import getTypeName from "type-name";

export type { KeyNotFoundErrorArgs, KeyNotFoundErrorMeta } from "@unikvs/core";
export { KeyNotFoundError } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#error-invalid-token)
 */
export type InvalidTokenErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#error-invalid-token)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#error-invalid-token)
 */
export type InvalidTokenErrorArgs = ErrorOptions & InvalidTokenErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#error-invalid-token)
 */
export class InvalidTokenError extends InvalidUsageErrorBase<InvalidTokenErrorMeta> {
  static {
    this.prototype.name = "VercelBlobInvalidTokenError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#error-invalid-token)
   */
  public constructor(args: InvalidTokenErrorArgs) {
    const { actual, ...options } = args;
    const meta: InvalidTokenErrorMeta = { actual };
    super(
      meta,
      ({ actual: messageActual }) =>
        `Expected token to be a non-empty string, but got ${String(messageActual)}`,
      options,
    );
  }
}

setErrorMessage(
  InvalidTokenError,
  ({ actual }) => `トークンは空でない文字列でなければなりません。受け取った値: ${String(actual)}`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#error-invalid-access)
 */
export type InvalidAccessErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#error-invalid-access)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#error-invalid-access)
 */
export type InvalidAccessErrorArgs = ErrorOptions & InvalidAccessErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#error-invalid-access)
 */
export class InvalidAccessError extends InvalidUsageErrorBase<InvalidAccessErrorMeta> {
  static {
    this.prototype.name = "VercelBlobInvalidAccessError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#error-invalid-access)
   */
  public constructor(args: InvalidAccessErrorArgs) {
    const { actual, ...options } = args;
    const meta: InvalidAccessErrorMeta = { actual };
    super(
      meta,
      ({ actual: messageActual }) =>
        `Expected access to be "public" or "private", but got ${String(messageActual)}`,
      options,
    );
  }
}

setErrorMessage(
  InvalidAccessError,
  ({ actual }) =>
    `\`access\` は "public" か "private" でなければなりません。受け取った値: ${String(actual)}`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#error-blob-operation)
 */
export type BlobOperationErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#error-blob-operation)
   */
  readonly operation: "put" | "head" | "del" | "list";

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#error-blob-operation)
   */
  readonly key?: string | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#error-blob-operation)
 */
export type BlobOperationErrorArgs = ErrorOptions & BlobOperationErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#error-blob-operation)
 */
export class BlobOperationError extends ErrorBase<BlobOperationErrorMeta> {
  static {
    this.prototype.name = "VercelBlobOperationError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#error-blob-operation)
   */
  public constructor(args: BlobOperationErrorArgs) {
    const { key, operation, ...options } = args;
    const meta: BlobOperationErrorMeta = {
      key,
      operation,
    };
    super(
      meta,
      ({ key: messageKey, operation: messageOperation }) =>
        messageKey === undefined
          ? `Failed to ${messageOperation} blob(s)`
          : `Failed to ${messageOperation} blob for key ${JSON.stringify(messageKey)}`,
      options,
    );
  }
}

setErrorMessage(
  BlobOperationError,
  ({ key, operation }) =>
    key === undefined
      ? `Blob の ${operation} に失敗しました`
      : `キー ${JSON.stringify(key)} の Blob の ${operation} に失敗しました`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#error-blob-network)
 */
export type BlobNetworkErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#error-blob-network)
   */
  readonly url: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#error-blob-network)
   */
  readonly key: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#error-blob-network)
 */
export type BlobNetworkErrorArgs = ErrorOptions & BlobNetworkErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#error-blob-network)
 */
export class BlobNetworkError extends ErrorBase<BlobNetworkErrorMeta> {
  static {
    this.prototype.name = "VercelBlobNetworkError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#error-blob-network)
   */
  public constructor(args: BlobNetworkErrorArgs) {
    const { key, url, ...options } = args;
    const meta: BlobNetworkErrorMeta = {
      key,
      url,
    };
    super(meta, ({ url: messageUrl }) => `Failed to download ${messageUrl}`, options);
  }
}

setErrorMessage(BlobNetworkError, ({ url }) => `${url} のダウンロード要求に失敗しました`, "ja");

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#error-blob-response)
 */
export type BlobResponseErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#error-blob-response)
   */
  readonly url: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#error-blob-response)
   */
  readonly key: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#error-blob-response)
   */
  readonly status: number;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#error-blob-response)
   */
  readonly statusText: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#error-blob-response)
 */
export type BlobResponseErrorArgs = ErrorOptions & BlobResponseErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#error-blob-response)
 */
export class BlobResponseError extends ErrorBase<BlobResponseErrorMeta> {
  static {
    this.prototype.name = "VercelBlobResponseError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#error-blob-response)
   */
  public constructor(args: BlobResponseErrorArgs) {
    const { key, url, status, statusText, ...options } = args;
    const meta: BlobResponseErrorMeta = {
      key,
      url,
      status,
      statusText,
    };
    super(
      meta,
      ({ url: messageUrl, status: messageStatus, statusText: messageStatusText }) =>
        `Failed to download ${messageUrl} with ${messageStatus}${messageStatusText === "" ? "" : ` ${messageStatusText}`}`,
      options,
    );
  }
}

setErrorMessage(
  BlobResponseError,
  ({ url, status, statusText }) =>
    `${url} のダウンロードが ${status}${statusText === "" ? "" : ` ${statusText}`} で失敗しました`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#error-invalid-chunk-type)
 */
export type InvalidChunkTypeErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#error-invalid-chunk-type)
   */
  readonly key: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#error-invalid-chunk-type)
   */
  readonly chunk: unknown;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#error-invalid-chunk-type)
   */
  readonly chunkType: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#error-invalid-chunk-type)
 */
export type InvalidChunkTypeErrorArgs = ErrorOptions & Omit<InvalidChunkTypeErrorMeta, "chunkType">;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#error-invalid-chunk-type)
 */
export class InvalidChunkTypeError extends ErrorBase<InvalidChunkTypeErrorMeta> {
  static {
    this.prototype.name = "VercelBlobInvalidChunkTypeError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#error-invalid-chunk-type)
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
