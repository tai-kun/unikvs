import { InvalidUsageErrorBase, setErrorMessage, type ErrorOptions } from "@unikvs/core";

export type { KeyNotFoundErrorArgs, KeyNotFoundErrorMeta } from "@unikvs/core";
export { KeyNotFoundError } from "@unikvs/core";

/**
 * 無効な `ttlSeconds` が指定されたときのメタ情報です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-kv#errors)
 */
export type InvalidTtlSecondsErrorMeta = {
  /**
   * 受け取った `ttlSeconds` の値です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-kv#errors)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-kv#errors)
 */
export type InvalidTtlSecondsErrorArgs = ErrorOptions & InvalidTtlSecondsErrorMeta;

/**
 * `ttlSeconds` が正の整数ではないときに投げます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-kv#errors)
 */
export class InvalidTtlSecondsError extends InvalidUsageErrorBase<InvalidTtlSecondsErrorMeta> {
  static {
    this.prototype.name = "VercelKvInvalidTtlSecondsError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-kv#errors)
   */
  public constructor(args: InvalidTtlSecondsErrorArgs) {
    const { actual, ...options } = args;
    const meta: InvalidTtlSecondsErrorMeta = { actual };
    super(
      meta,
      ({ actual }) =>
        `\`ttlSeconds\` must be a positive integer (seconds), but got ${String(actual)}.`,
      options,
    );
  }
}

setErrorMessage(
  InvalidTtlSecondsError,
  ({ actual }) =>
    `\`ttlSeconds\` は正の整数 (秒) でなければなりません。受け取った値: ${String(actual)}`,
  "ja",
);

/**
 * Vercel KV クライアントが利用できないときに投げます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-kv#errors)
 */
export class ClientNotAvailableError extends InvalidUsageErrorBase<undefined> {
  static {
    this.prototype.name = "VercelKvClientNotAvailableError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-kv#errors)
   */
  public constructor(options?: ErrorOptions) {
    super(
      "No Vercel KV client is available. Pass `kv` in options, set `url` and `token`, or define KV_REST_API_URL and KV_REST_API_TOKEN. Creating a client from a URL and token requires the optional `@vercel/kv` package.",
      options,
    );
  }
}

setErrorMessage(
  ClientNotAvailableError,
  "Vercel KV クライアントが利用できません。オプションに `kv` を渡すか、`url` と `token` を設定するか、KV_REST_API_URL と KV_REST_API_TOKEN を定義してください。URL とトークンからの生成には任意依存の `@vercel/kv` が必要です。",
  "ja",
);

/**
 * キー接頭辞なしの `clear` を拒否したときに投げます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-kv#errors)
 */
export class ClearWithoutPrefixNotAllowedError extends InvalidUsageErrorBase<undefined> {
  static {
    this.prototype.name = "VercelKvClearWithoutPrefixNotAllowedError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-kv#errors)
   */
  public constructor(options?: ErrorOptions) {
    super("Refusing to clear without a key prefix. Set a non-empty keyPrefix.", options);
  }
}

setErrorMessage(
  ClearWithoutPrefixNotAllowedError,
  "キープレフィックスなしでの clear を拒否します。空でない keyPrefix を設定してください。",
  "ja",
);
