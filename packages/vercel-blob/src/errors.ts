import { ErrorBase, InvalidUsageErrorBase, type ErrorOptions, setErrorMessage } from "@unikvs/core";
import getTypeName from "type-name";

export type { KeyNotFoundErrorArgs, KeyNotFoundErrorMeta } from "@unikvs/core";
export { KeyNotFoundError } from "@unikvs/core";

/**
 * `token` オプションの値の形式です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#errors)
 */
export type InvalidTokenErrorMeta = {
  /**
   * 受け取った `token` の値です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#errors)
   */
  readonly actual: unknown;
};

/**
 * `token` オプションの値の引数です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#errors)
 */
export type InvalidTokenErrorArgs = ErrorOptions & InvalidTokenErrorMeta;

/**
 * `token` が空でない文字列ではないときに投げます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#errors)
 */
export class InvalidTokenError extends InvalidUsageErrorBase<InvalidTokenErrorMeta> {
  static {
    this.prototype.name = "VercelBlobInvalidTokenError";
  }

  /**
   * `token` が空でない文字列ではないときに投げます。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#errors)
   */
  public constructor(args: InvalidTokenErrorArgs) {
    const { actual, ...options } = args;
    const meta: InvalidTokenErrorMeta = { actual };
    super(
      meta,
      ({ actual }) => `Expected token to be a non-empty string, but got ${String(actual)}`,
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
 * `access` オプションの値の形式です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#errors)
 */
export type InvalidAccessErrorMeta = {
  /**
   * 受け取った `access` の値です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#errors)
   */
  readonly actual: unknown;
};

/**
 * `access` オプションの値の引数です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#errors)
 */
export type InvalidAccessErrorArgs = ErrorOptions & InvalidAccessErrorMeta;

/**
 * `access` が `"public"` でも `"private"` でもないときに投げます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#errors)
 */
export class InvalidAccessError extends InvalidUsageErrorBase<InvalidAccessErrorMeta> {
  static {
    this.prototype.name = "VercelBlobInvalidAccessError";
  }

  /**
   * `access` が `"public"` でも `"private"` でもないときに投げます。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#errors)
   */
  public constructor(args: InvalidAccessErrorArgs) {
    const { actual, ...options } = args;
    const meta: InvalidAccessErrorMeta = { actual };
    super(
      meta,
      ({ actual }) => `Expected access to be "public" or "private", but got ${String(actual)}`,
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
 * Blob 操作の失敗内容です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#errors)
 */
export type BlobOperationErrorMeta = {
  /**
   * 失敗した操作の名前です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#errors)
   */
  readonly operation: "put" | "head" | "del" | "list";

  /**
   * 操作対象のキーです。`clear` の `list` / `del` では存在しません。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#errors)
   */
  readonly key?: string | undefined;
};

/**
 * Blob 操作の失敗引数です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#errors)
 */
export type BlobOperationErrorArgs = ErrorOptions & BlobOperationErrorMeta;

/**
 * Vercel Blob クライアントの操作に失敗したときに投げます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#errors)
 */
export class BlobOperationError extends ErrorBase<BlobOperationErrorMeta> {
  static {
    this.prototype.name = "VercelBlobOperationError";
  }

  /**
   * Vercel Blob クライアントの操作に失敗したときに投げます。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#errors)
   */
  public constructor(args: BlobOperationErrorArgs) {
    const { operation, key, ...options } = args;
    const meta: BlobOperationErrorMeta = { operation, key };
    super(
      meta,
      ({ operation, key }) =>
        key === undefined
          ? `Failed to ${operation} blob(s)`
          : `Failed to ${operation} blob for key ${JSON.stringify(key)}`,
      options,
    );
  }
}

setErrorMessage(
  BlobOperationError,
  ({ operation, key }) =>
    key === undefined
      ? `Blob の ${operation} に失敗しました`
      : `キー ${JSON.stringify(key)} の Blob の ${operation} に失敗しました`,
  "ja",
);

/**
 * ダウンロード要求の失敗内容です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#errors)
 */
export type BlobNetworkErrorMeta = {
  /**
   * 要求先の URL です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#errors)
   */
  readonly url: string;

  /**
   * 操作対象のキーです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#errors)
   */
  readonly key: string;
};

/**
 * ダウンロード要求の失敗引数です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#errors)
 */
export type BlobNetworkErrorArgs = ErrorOptions & BlobNetworkErrorMeta;

/**
 * Blob のダウンロード要求自体に失敗したときに投げます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#errors)
 */
export class BlobNetworkError extends ErrorBase<BlobNetworkErrorMeta> {
  static {
    this.prototype.name = "VercelBlobNetworkError";
  }

  /**
   * Blob のダウンロード要求自体に失敗したときに投げます。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#errors)
   */
  public constructor(args: BlobNetworkErrorArgs) {
    const { url, key, ...options } = args;
    const meta: BlobNetworkErrorMeta = { url, key };
    super(meta, ({ url }) => `Failed to download ${url}`, options);
  }
}

setErrorMessage(BlobNetworkError, ({ url }) => `${url} のダウンロード要求に失敗しました`, "ja");

/**
 * ダウンロード応答の失敗内容です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#errors)
 */
export type BlobResponseErrorMeta = {
  /**
   * 要求先の URL です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#errors)
   */
  readonly url: string;

  /**
   * 操作対象のキーです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#errors)
   */
  readonly key: string;

  /**
   * 応答のステータスコードです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#errors)
   */
  readonly status: number;

  /**
   * 応答のステータステキストです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#errors)
   */
  readonly statusText: string;
};

/**
 * ダウンロード応答の失敗引数です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#errors)
 */
export type BlobResponseErrorArgs = ErrorOptions & BlobResponseErrorMeta;

/**
 * Blob のダウンロード応答が失敗ステータスのときに投げます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#errors)
 */
export class BlobResponseError extends ErrorBase<BlobResponseErrorMeta> {
  static {
    this.prototype.name = "VercelBlobResponseError";
  }

  /**
   * Blob のダウンロード応答が失敗ステータスのときに投げます。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#errors)
   */
  public constructor(args: BlobResponseErrorArgs) {
    const { url, key, status, statusText, ...options } = args;
    const meta: BlobResponseErrorMeta = { url, key, status, statusText };
    super(
      meta,
      ({ url, status, statusText }) =>
        `Failed to download ${url} with ${status}${statusText === "" ? "" : ` ${statusText}`}`,
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
 * チャンクの形式です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#errors)
 */
export type InvalidChunkTypeErrorMeta = {
  /**
   * 操作対象のキーです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#errors)
   */
  readonly key: string;

  /**
   * 受け取ったチャンクです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#errors)
   */
  readonly chunk: unknown;

  /**
   * 受け取ったチャンクの型名です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#errors)
   */
  readonly chunkType: string;
};

/**
 * チャンクの引数です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#errors)
 */
export type InvalidChunkTypeErrorArgs = ErrorOptions & Omit<InvalidChunkTypeErrorMeta, "chunkType">;

/**
 * チャンクが `Uint8Array<ArrayBuffer>` ではないときに投げます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#errors)
 */
export class InvalidChunkTypeError extends ErrorBase<InvalidChunkTypeErrorMeta> {
  static {
    this.prototype.name = "VercelBlobInvalidChunkTypeError";
  }

  /**
   * チャンクが `Uint8Array<ArrayBuffer>` ではないときに投げます。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#errors)
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
