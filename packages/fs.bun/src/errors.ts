import { InvalidUsageErrorBase, type ErrorOptions, setErrorMessage } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/fs-bun#errors)
 */
export class UnsupportedRuntimeError extends InvalidUsageErrorBase<undefined> {
  static {
    this.prototype.name = "BunFsUnsupportedRuntimeError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/fs-bun#errors)
   */
  public constructor(options?: ErrorOptions) {
    super("BunFs can only be used in the Bun runtime", options);
  }
}

setErrorMessage(UnsupportedRuntimeError, "BunFs は Bun ランタイムでのみ使用できます", "ja");
