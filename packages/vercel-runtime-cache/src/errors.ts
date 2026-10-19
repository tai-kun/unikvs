import { ErrorBase, InvalidUsageErrorBase, type ErrorOptions, setErrorMessage } from "@unikvs/core";
import getTypeName from "type-name";

export type { KeyNotFoundErrorArgs, KeyNotFoundErrorMeta } from "@unikvs/core";
export { KeyNotFoundError } from "@unikvs/core";

/**
 * チャンクの型が不正なときのメタ情報です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#errors)
 */
export type InvalidChunkTypeErrorMeta = {
  /**
   * 対象のキーです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#errors)
   */
  readonly key: string;

  /**
   * 受け取ったチャンクです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#errors)
   */
  readonly chunk: unknown;

  /**
   * 受け取ったチャンクの型名です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#errors)
   */
  readonly chunkType: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#errors)
 */
export type InvalidChunkTypeErrorArgs = ErrorOptions & Omit<InvalidChunkTypeErrorMeta, "chunkType">;

/**
 * チャンクが `Uint8Array<ArrayBuffer>` ではないときに投げます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#errors)
 */
export class InvalidChunkTypeError extends ErrorBase<InvalidChunkTypeErrorMeta> {
  static {
    this.prototype.name = "VercelRuntimeCacheInvalidChunkTypeError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#errors)
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

/**
 * 無効な `ttlSeconds` が指定されたときのメタ情報です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#errors)
 */
export type InvalidTtlSecondsErrorMeta = {
  /**
   * 受け取った `ttlSeconds` の値です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#errors)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#errors)
 */
export type InvalidTtlSecondsErrorArgs = ErrorOptions & InvalidTtlSecondsErrorMeta;

/**
 * `ttlSeconds` が 0 より大きい有限数ではないときに投げます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#errors)
 */
export class InvalidTtlSecondsError extends InvalidUsageErrorBase<InvalidTtlSecondsErrorMeta> {
  static {
    this.prototype.name = "VercelRuntimeCacheInvalidTtlSecondsError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#errors)
   */
  public constructor(args: InvalidTtlSecondsErrorArgs) {
    const { actual, ...options } = args;
    const meta: InvalidTtlSecondsErrorMeta = { actual };
    super(
      meta,
      ({ actual }) => `ttlSeconds must be a finite number > 0, but got ${String(actual)}`,
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
 * 無効な `maxEntries` が指定されたときのメタ情報です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#errors)
 */
export type InvalidMaxEntriesErrorMeta = {
  /**
   * 受け取った `maxEntries` の値です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#errors)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#errors)
 */
export type InvalidMaxEntriesErrorArgs = ErrorOptions & InvalidMaxEntriesErrorMeta;

/**
 * `maxEntries` が 0 以上の整数ではないときに投げます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#errors)
 */
export class InvalidMaxEntriesError extends InvalidUsageErrorBase<InvalidMaxEntriesErrorMeta> {
  static {
    this.prototype.name = "VercelRuntimeCacheInvalidMaxEntriesError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#errors)
   */
  public constructor(args: InvalidMaxEntriesErrorArgs) {
    const { actual, ...options } = args;
    const meta: InvalidMaxEntriesErrorMeta = { actual };
    super(
      meta,
      ({ actual }) => `maxEntries must be an integer >= 0, but got ${String(actual)}`,
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
 * 無効な `namespace` が指定されたときのメタ情報です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#errors)
 */
export type InvalidNamespaceErrorMeta = {
  /**
   * 受け取った `namespace` の値です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#errors)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#errors)
 */
export type InvalidNamespaceErrorArgs = ErrorOptions & InvalidNamespaceErrorMeta;

/**
 * `namespace` が文字列ではないときに投げます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#errors)
 */
export class InvalidNamespaceError extends InvalidUsageErrorBase<InvalidNamespaceErrorMeta> {
  static {
    this.prototype.name = "VercelRuntimeCacheInvalidNamespaceError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#errors)
   */
  public constructor(args: InvalidNamespaceErrorArgs) {
    const { actual, ...options } = args;
    const meta: InvalidNamespaceErrorMeta = { actual };
    super(meta, ({ actual }) => `namespace must be a string, but got ${String(actual)}`, options);
  }
}

setErrorMessage(
  InvalidNamespaceError,
  ({ actual }) => `namespace は文字列でなければなりません。受け取った値: ${String(actual)}`,
  "ja",
);
