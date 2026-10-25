import { type ErrorOptions, ErrorBase, setErrorMessage, InvalidUsageErrorBase } from "@unikvs/core";
import { inspect } from "inspect-lite";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/brotli-wasm#errors)
 */
export class BrotliWasmInitError extends ErrorBase<undefined> {
  static {
    this.prototype.name = "UniKvsBrotliWasmInitError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/brotli-wasm#errors)
   */
  public constructor(options?: ErrorOptions) {
    super("Failed to initialize the brotli module", options);
  }
}

setErrorMessage(BrotliWasmInitError, "brotli モジュールの初期化に失敗しました", "ja");

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/brotli-wasm#errors)
 */
export type BrotliWasmInvalidLevelErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/brotli-wasm#errors)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/brotli-wasm#errors)
 */
export type BrotliWasmInvalidLevelErrorArgs = ErrorOptions & BrotliWasmInvalidLevelErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/brotli-wasm#errors)
 */
export class BrotliWasmInvalidLevelError extends InvalidUsageErrorBase<BrotliWasmInvalidLevelErrorMeta> {
  static {
    this.prototype.name = "UniKvsBrotliWasmInvalidLevelError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/brotli-wasm#errors)
   */
  public constructor(args: BrotliWasmInvalidLevelErrorArgs) {
    const { actual, ...options } = args;
    const meta: BrotliWasmInvalidLevelErrorMeta = { actual };
    super(
      meta,
      ({ actual: messageActual }) => `Invalid brotli compression level: ${inspect(messageActual)}`,
      options,
    );
  }
}

setErrorMessage(
  BrotliWasmInvalidLevelError,
  ({ actual }) => `無効な brotli 圧縮レベル: ${inspect(actual)}`,
  "ja",
);
