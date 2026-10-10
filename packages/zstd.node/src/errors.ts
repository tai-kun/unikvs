import { ErrorBase, setErrorMessage, type ErrorOptions } from "@unikvs/core";
import { inspect } from "inspect-lite";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.node#errors)
 */
export class ZstdNodeDecompressError extends ErrorBase<undefined> {
  static {
    this.prototype.name = "UniKvsZstdNodeDecompressError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.node#errors)
   */
  public constructor(options?: ErrorOptions) {
    super("Failed to decompress the zstd data", options);
  }
}

setErrorMessage(ZstdNodeDecompressError, "zstd データの展開に失敗しました", "ja");

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.node#errors)
 */
export type ZstdNodeInvalidLevelErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.node#errors)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.node#errors)
 */
export type ZstdNodeInvalidLevelErrorArgs = ErrorOptions & ZstdNodeInvalidLevelErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.node#errors)
 */
export class ZstdNodeInvalidLevelError extends ErrorBase<ZstdNodeInvalidLevelErrorMeta> {
  static {
    this.prototype.name = "UniKvsZstdNodeInvalidLevelError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd.node#errors)
   */
  public constructor(args: ZstdNodeInvalidLevelErrorArgs) {
    const { actual, ...options } = args;
    const meta: ZstdNodeInvalidLevelErrorMeta = { actual };
    super(meta, ({ actual }) => `Invalid zstd compression level: ${inspect(actual)}`, options);
  }
}

setErrorMessage(
  ZstdNodeInvalidLevelError,
  ({ actual }) => `無効な zstd 圧縮レベル: ${inspect(actual)}`,
  "ja",
);

export type { UnsupportedRuntimeErrorArgs, UnsupportedRuntimeErrorMeta } from "@unikvs/core";
export { UnsupportedRuntimeError } from "@unikvs/core";
