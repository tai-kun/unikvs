import { type ErrorOptions, ErrorBase, setErrorMessage, InvalidUsageErrorBase } from "@unikvs/core";
import getTypeName from "type-name";

export type { KeyNotFoundErrorArgs, KeyNotFoundErrorMeta } from "@unikvs/core";
export { KeyNotFoundError } from "@unikvs/core";

/**
 * `origin` オプションの値の形式です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#errors)
 */
export type InvalidOriginErrorMeta = {
  /**
   * 受け取った `origin` の値です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#errors)
   */
  readonly actual: unknown;
};

/**
 * `origin` オプションの値の引数です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#errors)
 */
export type InvalidOriginErrorArgs = ErrorOptions & InvalidOriginErrorMeta;

/**
 * `origin` がクエリー・フラグメントなしの絶対 URL ではないときに投げます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#errors)
 */
export class InvalidOriginError extends InvalidUsageErrorBase<InvalidOriginErrorMeta> {
  static {
    this.prototype.name = "CloudflareCacheInvalidOriginError";
  }

  /**
   * `origin` がクエリー・フラグメントなしの絶対 URL ではないときに投げます。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#errors)
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
 * キーの符号化に失敗したときのメタ情報です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#errors)
 */
export type InvalidKeyErrorMeta = {
  /**
   * 符号化に失敗したキーです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#errors)
   */
  readonly key: string;
};

/**
 * キーの符号化に失敗したときの引数です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#errors)
 */
export type InvalidKeyErrorArgs = ErrorOptions & InvalidKeyErrorMeta;

/**
 * キーを URL パスセグメントとして符号化できないときに投げます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#errors)
 */
export class InvalidKeyError extends InvalidUsageErrorBase<InvalidKeyErrorMeta> {
  static {
    this.prototype.name = "CloudflareCacheInvalidKeyError";
  }

  /**
   * キーを URL パスセグメントとして符号化できないときに投げます。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#errors)
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
 * Cache binding が見つからないときのメタ情報です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#errors)
 */
export type CacheBindingNotFoundErrorMeta = {
  /**
   * 参照を試みたプロパティの名前です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#errors)
   */
  readonly property: string;
};

/**
 * Cache binding が見つからないときの引数です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#errors)
 */
export type CacheBindingNotFoundErrorArgs = ErrorOptions & CacheBindingNotFoundErrorMeta;

/**
 * `cache` オプションがなく `caches.default` も存在しないときに投げます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#errors)
 */
export class CacheBindingNotFoundError extends InvalidUsageErrorBase<CacheBindingNotFoundErrorMeta> {
  static {
    this.prototype.name = "CloudflareCacheBindingNotFoundError";
  }

  /**
   * `cache` オプションがなく `caches.default` も存在しないときに投げます。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#errors)
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
 * Cache 操作に失敗したときのメタ情報です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#errors)
 */
export type CacheOperationErrorMeta = {
  /**
   * 失敗した操作名 (`put` / `match` / `delete`) です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#errors)
   */
  readonly operation: string;

  /**
   * 操作対象のキーです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#errors)
   */
  readonly key: string | undefined;
};

/**
 * Cache 操作に失敗したときの引数です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#errors)
 */
export type CacheOperationErrorArgs = ErrorOptions & CacheOperationErrorMeta;

/**
 * `put` / `match` / `delete` が拒否したときに投げます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#errors)
 */
export class CacheOperationError extends ErrorBase<CacheOperationErrorMeta> {
  static {
    this.prototype.name = "CloudflareCacheOperationError";
  }

  /**
   * `put` / `match` / `delete` が拒否したときに投げます。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#errors)
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
 * `clear` が未対応であることを表すエラーです。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#errors)
 */
export class ClearNotSupportedError extends InvalidUsageErrorBase<undefined> {
  static {
    this.prototype.name = "CloudflareCacheClearNotSupportedError";
  }

  /**
   * `clear` が未対応であることを表すエラーです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#errors)
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
 * チャンクの型が不正なときのメタ情報です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#errors)
 */
export type InvalidChunkTypeErrorMeta = {
  /**
   * 書き込み対象のキーです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#errors)
   */
  readonly key: string;

  /**
   * 受け取ったチャンクです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#errors)
   */
  readonly chunk: unknown;

  /**
   * 受け取ったチャンクの型名です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#errors)
   */
  readonly chunkType: string;
};

/**
 * チャンクの型が不正なときの引数です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#errors)
 */
export type InvalidChunkTypeErrorArgs = ErrorOptions & Omit<InvalidChunkTypeErrorMeta, "chunkType">;

/**
 * チャンクが `Uint8Array<ArrayBuffer>` ではないときに投げます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#errors)
 */
export class InvalidChunkTypeError extends ErrorBase<InvalidChunkTypeErrorMeta> {
  static {
    this.prototype.name = "CloudflareCacheInvalidChunkTypeError";
  }

  /**
   * チャンクが `Uint8Array<ArrayBuffer>` ではないときに投げます。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#errors)
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
