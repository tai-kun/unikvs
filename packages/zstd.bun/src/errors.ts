import { type ErrorOptions, setErrorMessage, InvalidUsageErrorBase } from "@unikvs/core";
import { inspect } from "inspect-lite";

export type { UnsupportedRuntimeErrorArgs, UnsupportedRuntimeErrorMeta } from "@unikvs/core";
export { UnsupportedRuntimeError } from "@unikvs/core";

/**
 * 無効な zstd 圧縮レベルが指定されたときに投げられるエラーです。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd-bun#errors)
 */
export type ZstdBunInvalidLevelErrorMeta = {
  /**
   * 指定された圧縮レベルです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd-bun#errors)
   */
  readonly actual: unknown;
};

/**
 * 無効な zstd 圧縮レベルが指定されたときに投げられるエラーの引数です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd-bun#errors)
 */
export type ZstdBunInvalidLevelErrorArgs = ErrorOptions & ZstdBunInvalidLevelErrorMeta;

/**
 * 無効な zstd 圧縮レベルが指定されたときに投げられるエラーです。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd-bun#errors)
 */
export class ZstdBunInvalidLevelError extends InvalidUsageErrorBase<ZstdBunInvalidLevelErrorMeta> {
  static {
    this.prototype.name = "UniKvsZstdBunInvalidLevelError";
  }

  /**
   * @param args エラーの引数です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/zstd-bun#errors)
   */
  public constructor(args: ZstdBunInvalidLevelErrorArgs) {
    const { actual, ...options } = args;
    const meta: ZstdBunInvalidLevelErrorMeta = { actual };
    super(meta, ({ actual }) => `Invalid zstd compression level: ${inspect(actual)}`, options);
  }
}

setErrorMessage(
  ZstdBunInvalidLevelError,
  ({ actual }) => `無効な zstd 圧縮レベル: ${inspect(actual)}`,
  "ja",
);
