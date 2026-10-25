import { type ErrorOptions, ErrorBase, setErrorMessage, InvalidUsageErrorBase } from "@unikvs/core";
import { inspect } from "inspect-lite";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/brotli-wasm#error-brotli-wasm-init)
 */
export class BrotliWasmInitError extends ErrorBase<undefined> {
  static {
    this.prototype.name = "UniKvsBrotliWasmInitError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/brotli-wasm#error-brotli-wasm-init)
   */
  public constructor(options?: ErrorOptions) {
    super("Failed to initialize the brotli module", options);
  }
}

setErrorMessage(BrotliWasmInitError, "brotli モジュールの初期化に失敗しました", "ja");

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/brotli-wasm#error-brotli-wasm-invalid-level)
 */
export type BrotliWasmInvalidLevelErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/brotli-wasm#brotli-wasm-invalid-level-actual)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/brotli-wasm#error-brotli-wasm-invalid-level)
 */
export type BrotliWasmInvalidLevelErrorArgs = ErrorOptions & BrotliWasmInvalidLevelErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/brotli-wasm#error-brotli-wasm-invalid-level)
 */
export class BrotliWasmInvalidLevelError extends InvalidUsageErrorBase<BrotliWasmInvalidLevelErrorMeta> {
  static {
    this.prototype.name = "UniKvsBrotliWasmInvalidLevelError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/brotli-wasm#error-brotli-wasm-invalid-level)
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
