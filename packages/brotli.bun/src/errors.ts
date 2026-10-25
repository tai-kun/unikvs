import { type ErrorOptions, setErrorMessage, InvalidUsageErrorBase } from "@unikvs/core";
import { inspect } from "inspect-lite";

export type { UnsupportedRuntimeErrorArgs, UnsupportedRuntimeErrorMeta } from "@unikvs/core";
export { UnsupportedRuntimeError } from "@unikvs/core";

/**
 * 無効な brotli 圧縮レベルが指定されたときに投げられるエラーです。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/brotli-bun#error-brotli-bun-invalid-level)
 */
export type BrotliBunInvalidLevelErrorMeta = {
  /**
   * 指定された圧縮レベルです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/brotli-bun#brotli-bun-invalid-level-actual)
   */
  readonly actual: unknown;
};

/**
 * 無効な brotli 圧縮レベルが指定されたときに投げられるエラーの引数です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/brotli-bun#error-brotli-bun-invalid-level)
 */
export type BrotliBunInvalidLevelErrorArgs = ErrorOptions & BrotliBunInvalidLevelErrorMeta;

/**
 * 無効な brotli 圧縮レベルが指定されたときに投げられるエラーです。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/brotli-bun#error-brotli-bun-invalid-level)
 */
export class BrotliBunInvalidLevelError extends InvalidUsageErrorBase<BrotliBunInvalidLevelErrorMeta> {
  static {
    this.prototype.name = "UniKvsBrotliBunInvalidLevelError";
  }

  /**
   * @param args エラーの引数です。
   * [API Reference](https://tai-kun.github.io/unikvs/packages/brotli-bun#error-brotli-bun-invalid-level)
   */
  public constructor(args: BrotliBunInvalidLevelErrorArgs) {
    const { actual, ...options } = args;
    const meta: BrotliBunInvalidLevelErrorMeta = { actual };
    super(
      meta,
      ({ actual: messageActual }) => `Invalid brotli compression level: ${inspect(messageActual)}`,
      options,
    );
  }
}

setErrorMessage(
  BrotliBunInvalidLevelError,
  ({ actual }) => `無効な brotli 圧縮レベル: ${inspect(actual)}`,
  "ja",
);
