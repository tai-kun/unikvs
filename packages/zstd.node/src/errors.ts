import { type ErrorOptions, setErrorMessage, InvalidUsageErrorBase } from "@unikvs/core";
import { inspect } from "inspect-lite";

export type { UnsupportedRuntimeErrorArgs, UnsupportedRuntimeErrorMeta } from "@unikvs/core";
export { UnsupportedRuntimeError } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd-node#error-zstd-node-invalid-level)
 */
export type ZstdNodeInvalidLevelErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd-node#zstd-node-invalid-level-actual)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd-node#error-zstd-node-invalid-level)
 */
export type ZstdNodeInvalidLevelErrorArgs = ErrorOptions & ZstdNodeInvalidLevelErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd-node#error-zstd-node-invalid-level)
 */
export class ZstdNodeInvalidLevelError extends InvalidUsageErrorBase<ZstdNodeInvalidLevelErrorMeta> {
  static {
    this.prototype.name = "UniKvsZstdNodeInvalidLevelError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd-node#error-zstd-node-invalid-level)
   */
  public constructor(args: ZstdNodeInvalidLevelErrorArgs) {
    const { actual, ...options } = args;
    const meta: ZstdNodeInvalidLevelErrorMeta = { actual };
    super(
      meta,
      ({ actual: messageActual }) => `Invalid zstd compression level: ${inspect(messageActual)}`,
      options,
    );
  }
}

setErrorMessage(
  ZstdNodeInvalidLevelError,
  ({ actual }) => `無効な zstd 圧縮レベル: ${inspect(actual)}`,
  "ja",
);
