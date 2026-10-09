import { ErrorBase, InvalidUsageErrorBase, setErrorMessage, type ErrorOptions } from "@unikvs/core";
import getTypeName from "type-name";

export type { KeyNotFoundErrorArgs, KeyNotFoundErrorMeta } from "@unikvs/core";
export { KeyNotFoundError } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
 */
export type InvalidBaseUrlErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
 */
export type InvalidBaseUrlErrorArgs = ErrorOptions & InvalidBaseUrlErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
 */
export class InvalidBaseUrlError extends ErrorBase<InvalidBaseUrlErrorMeta> {
  static {
    this.prototype.name = "HttpInvalidBaseUrlError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
   */
  public constructor(args: InvalidBaseUrlErrorArgs) {
    const { actual, ...options } = args;
    const meta: InvalidBaseUrlErrorMeta = { actual };
    super(
      meta,
      ({ actual }) =>
        `\`baseUrl\` must be an absolute URL without query or fragment, but got ${String(actual)}`,
      options,
    );
  }
}

setErrorMessage(
  InvalidBaseUrlError,
  ({ actual }) =>
    `\`baseUrl\` はクエリー・フラグメントなしの絶対 URL でなければなりません。受け取った値: ${String(actual)}`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
 */
export type InvalidHeadersErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
 */
export type InvalidHeadersErrorArgs = ErrorOptions & InvalidHeadersErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
 */
export class InvalidHeadersError extends ErrorBase<InvalidHeadersErrorMeta> {
  static {
    this.prototype.name = "HttpInvalidHeadersError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
   */
  public constructor(args: InvalidHeadersErrorArgs) {
    const { actual, ...options } = args;
    const meta: InvalidHeadersErrorMeta = { actual };
    super(
      meta,
      ({ actual }) =>
        `Expected headers to be an object with string values, but got ${String(actual)}`,
      options,
    );
  }
}

setErrorMessage(
  InvalidHeadersError,
  ({ actual }) =>
    `ヘッダーは文字列を値に持つオブジェクトでなければなりません。受け取った値: ${String(actual)}`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
 */
export type InvalidTokenErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
 */
export type InvalidTokenErrorArgs = ErrorOptions & InvalidTokenErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
 */
export class InvalidTokenError extends ErrorBase<InvalidTokenErrorMeta> {
  static {
    this.prototype.name = "HttpInvalidTokenError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
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
 * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
 */
export type InvalidKeyErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
   */
  readonly key: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
 */
export type InvalidKeyErrorArgs = ErrorOptions & InvalidKeyErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
 */
export class InvalidKeyError extends ErrorBase<InvalidKeyErrorMeta> {
  static {
    this.prototype.name = "HttpInvalidKeyError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
   */
  public constructor(args: InvalidKeyErrorArgs) {
    const { key, ...options } = args;
    const meta: InvalidKeyErrorMeta = { key };
    super(
      meta,
      ({ key }) => `Failed to encode key ${JSON.stringify(key)} as a URL path segment`,
      options,
    );
  }
}

setErrorMessage(
  InvalidKeyError,
  ({ key }) => `キー ${JSON.stringify(key)} を URL パスセグメントとして符号化できませんでした`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
 */
export class ClearWithoutPrefixNotAllowedError extends InvalidUsageErrorBase<undefined> {
  static {
    this.prototype.name = "HttpClearWithoutPrefixNotAllowedError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
   */
  public constructor(options?: ErrorOptions) {
    super(
      "Refusing to clear without a key prefix. Set a non-empty keyPrefix or allowClearWithoutPrefix: true.",
      options,
    );
  }
}

setErrorMessage(
  ClearWithoutPrefixNotAllowedError,
  "キープレフィックスなしでの clear を拒否します。空でない keyPrefix を設定するか、allowClearWithoutPrefix: true を指定してください。",
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
 */
export type ClearNotSupportedErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
   */
  readonly prefix: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
   */
  readonly status: number;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
 */
export type ClearNotSupportedErrorArgs = ErrorOptions & ClearNotSupportedErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
 */
export class ClearNotSupportedError extends InvalidUsageErrorBase<ClearNotSupportedErrorMeta> {
  static {
    this.prototype.name = "HttpClearNotSupportedError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
   */
  public constructor(args: ClearNotSupportedErrorArgs) {
    const { prefix, status, ...options } = args;
    const meta: ClearNotSupportedErrorMeta = { prefix, status };
    super(
      meta,
      ({ prefix, status }) =>
        `Server does not support DELETE ?prefix= (prefix ${JSON.stringify(prefix)}, status ${status}). Implement prefix deletion on the server or stop calling clear.`,
      options,
    );
  }
}

setErrorMessage(
  ClearNotSupportedError,
  ({ prefix, status }) =>
    `サーバーが DELETE ?prefix= に対応していません (prefix ${JSON.stringify(prefix)}、status ${status})。サーバー側で prefix 削除を実装するか、clear の呼び出しを止めてください。`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
 */
export type HttpNetworkErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
   */
  readonly method: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
   */
  readonly url: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
   */
  readonly key: string | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
 */
export type HttpNetworkErrorArgs = ErrorOptions & HttpNetworkErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
 */
export class HttpNetworkError extends ErrorBase<HttpNetworkErrorMeta> {
  static {
    this.prototype.name = "HttpNetworkError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
   */
  public constructor(args: HttpNetworkErrorArgs) {
    const { method, url, key, ...options } = args;
    const meta: HttpNetworkErrorMeta = { method, url, key };
    super(meta, ({ method, url }) => `Failed to ${method} ${url}`, options);
  }
}

setErrorMessage(
  HttpNetworkError,
  ({ method, url }) => `${method} ${url} へのリクエストに失敗しました`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
 */
export type HttpResponseErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
   */
  readonly method: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
   */
  readonly url: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
   */
  readonly status: number;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
   */
  readonly statusText: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
   */
  readonly key: string | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
 */
export type HttpResponseErrorArgs = ErrorOptions & HttpResponseErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
 */
export class HttpResponseError extends ErrorBase<HttpResponseErrorMeta> {
  static {
    this.prototype.name = "HttpResponseError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
   */
  public constructor(args: HttpResponseErrorArgs) {
    const { method, url, status, statusText, key, ...options } = args;
    const meta: HttpResponseErrorMeta = { method, url, status, statusText, key };
    super(
      meta,
      ({ method, url, status, statusText }) =>
        `Request ${method} ${url} failed with ${status}${statusText === "" ? "" : ` ${statusText}`}`,
      options,
    );
  }
}

setErrorMessage(
  HttpResponseError,
  ({ method, url, status, statusText }) =>
    `リクエスト ${method} ${url} が ${status}${statusText === "" ? "" : ` ${statusText}`} で失敗しました`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
 */
export type InvalidChunkTypeErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
   */
  readonly key: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
   */
  readonly chunk: unknown;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
   */
  readonly chunkType: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
 */
export type InvalidChunkTypeErrorArgs = ErrorOptions & Omit<InvalidChunkTypeErrorMeta, "chunkType">;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
 */
export class InvalidChunkTypeError extends ErrorBase<InvalidChunkTypeErrorMeta> {
  static {
    this.prototype.name = "HttpInvalidChunkTypeError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#errors)
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
