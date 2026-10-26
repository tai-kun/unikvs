import { type ErrorOptions, setErrorMessage, InvalidUsageErrorBase } from "@unikvs/core";
import { inspect } from "inspect-lite";

export type { UnsupportedRuntimeErrorArgs, UnsupportedRuntimeErrorMeta } from "@unikvs/core";
export { UnsupportedRuntimeError } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd-bun#error-zstd-bun-invalid-level)
 */
export type ZstdBunInvalidLevelErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd-bun#zstd-bun-invalid-level-actual)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd-bun#error-zstd-bun-invalid-level)
 */
export type ZstdBunInvalidLevelErrorArgs = ErrorOptions & ZstdBunInvalidLevelErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd-bun#error-zstd-bun-invalid-level)
 */
export class ZstdBunInvalidLevelError extends InvalidUsageErrorBase<ZstdBunInvalidLevelErrorMeta> {
  static {
    this.prototype.name = "UniKvsZstdBunInvalidLevelError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd-bun#error-zstd-bun-invalid-level)
   */
  public constructor(args: ZstdBunInvalidLevelErrorArgs) {
    const { actual, ...options } = args;
    const meta: ZstdBunInvalidLevelErrorMeta = { actual };
    super(
      meta,
      ({ actual: messageActual }) => `Invalid zstd compression level: ${inspect(messageActual)}`,
      options,
    );
  }
}

setErrorMessage(
  ZstdBunInvalidLevelError,
  ({ actual }) => `無効な zstd 圧縮レベル: ${inspect(actual)}`,
  "ja",
);
