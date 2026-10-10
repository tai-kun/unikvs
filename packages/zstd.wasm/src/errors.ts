import { ErrorBase, setErrorMessage, type ErrorOptions } from "@unikvs/core";
import { inspect } from "inspect-lite";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.wasm#errors)
 */
export class ZstdWasmDecompressError extends ErrorBase<undefined> {
  static {
    this.prototype.name = "UniKvsZstdWasmDecompressError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.wasm#errors)
   */
  public constructor(options?: ErrorOptions) {
    super("Failed to decompress the zstd data", options);
  }
}

setErrorMessage(ZstdWasmDecompressError, "zstd データの展開に失敗しました", "ja");

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.wasm#errors)
 */
export class ZstdWasmInitError extends ErrorBase<undefined> {
  static {
    this.prototype.name = "UniKvsZstdWasmInitError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.wasm#errors)
   */
  public constructor(options?: ErrorOptions) {
    super("Failed to initialize the zstd module", options);
  }
}

setErrorMessage(ZstdWasmInitError, "zstd モジュールの初期化に失敗しました", "ja");

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.wasm#errors)
 */
export type ZstdWasmInvalidLevelErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.wasm#errors)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.wasm#errors)
 */
export type ZstdWasmInvalidLevelErrorArgs = ErrorOptions & ZstdWasmInvalidLevelErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.wasm#errors)
 */
export class ZstdWasmInvalidLevelError extends ErrorBase<ZstdWasmInvalidLevelErrorMeta> {
  static {
    this.prototype.name = "UniKvsZstdWasmInvalidLevelError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.wasm#errors)
   */
  public constructor(args: ZstdWasmInvalidLevelErrorArgs) {
    const { actual, ...options } = args;
    const meta: ZstdWasmInvalidLevelErrorMeta = { actual };
    super(meta, ({ actual }) => `Invalid zstd compression level: ${inspect(actual)}`, options);
  }
}

setErrorMessage(
  ZstdWasmInvalidLevelError,
  ({ actual }) => `無効な zstd 圧縮レベル: ${inspect(actual)}`,
  "ja",
);
