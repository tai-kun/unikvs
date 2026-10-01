import { ErrorBase, InvalidUsageErrorBase, type ErrorOptions, setErrorMessage } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-bun#errors)
 */
export class UnsupportedRuntimeError extends InvalidUsageErrorBase<undefined> {
  static {
    this.prototype.name = "RedisUnsupportedRuntimeError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-bun#errors)
   */
  public constructor(options?: ErrorOptions) {
    super("Redis can only be used in the Bun runtime", options);
  }
}

setErrorMessage(UnsupportedRuntimeError, "Redis は Bun ランタイムでのみ使用できます", "ja");

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-bun#errors)
 */
export type KeyNotFoundErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-bun#errors)
   */
  readonly key: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-bun#errors)
 */
export type KeyNotFoundErrorArgs = ErrorOptions & KeyNotFoundErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-bun#errors)
 */
export class KeyNotFoundError extends ErrorBase<KeyNotFoundErrorMeta> {
  static {
    this.prototype.name = "RedisKeyNotFoundError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-bun#errors)
   */
  public constructor(args: KeyNotFoundErrorArgs) {
    const { key, ...options } = args;
    const meta: KeyNotFoundErrorMeta = { key };
    super(meta, ({ key }) => `Key not found: ${key}`, options);
  }
}

setErrorMessage(KeyNotFoundError, ({ key }) => `キー ${key} が見つかりません`, "ja");
