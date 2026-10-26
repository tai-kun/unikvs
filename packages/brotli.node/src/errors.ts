import { type ErrorOptions, setErrorMessage, InvalidUsageErrorBase } from "@unikvs/core";
import { inspect } from "inspect-lite";

export type { UnsupportedRuntimeErrorArgs, UnsupportedRuntimeErrorMeta } from "@unikvs/core";
export { UnsupportedRuntimeError } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/brotli-node#error-brotli-invalid-level)
 */
export type BrotliInvalidLevelErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/brotli-node#brotli-invalid-level-actual)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/brotli-node#error-brotli-invalid-level)
 */
export type BrotliInvalidLevelErrorArgs = ErrorOptions & BrotliInvalidLevelErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/brotli-node#error-brotli-invalid-level)
 */
export class BrotliInvalidLevelError extends InvalidUsageErrorBase<BrotliInvalidLevelErrorMeta> {
  static {
    this.prototype.name = "UniKvsBrotliInvalidLevelError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/brotli-node#error-brotli-invalid-level)
   */
  public constructor(args: BrotliInvalidLevelErrorArgs) {
    const { actual, ...options } = args;
    const meta: BrotliInvalidLevelErrorMeta = { actual };
    super(
      meta,
      ({ actual: messageActual }) => `Invalid brotli compression level: ${inspect(messageActual)}`,
      options,
    );
  }
}

setErrorMessage(
  BrotliInvalidLevelError,
  ({ actual }) => `無効な brotli 圧縮レベル: ${inspect(actual)}`,
  "ja",
);
