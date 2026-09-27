import { ErrorBase, setErrorMessage, type ErrorOptions } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/utils#invalid-filename-error)
 */
export type InvalidFilenameErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/utils#invalid-filename-error)
   */
  readonly filename: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/utils#invalid-filename-error)
 */
export type InvalidFilenameErrorArgs = ErrorOptions & InvalidFilenameErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/utils#invalid-filename-error)
 */
export class InvalidFilenameError extends ErrorBase<InvalidFilenameErrorMeta> {
  static {
    this.prototype.name = "UniKvsInvalidFilenameError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/utils#invalid-filename-error)
   */
  public constructor(args: InvalidFilenameErrorArgs) {
    const { filename, ...options } = args;
    const meta: InvalidFilenameErrorMeta = { filename };
    super(meta, ({ filename }) => `Invalid file name: ${filename}`, options);
  }
}

setErrorMessage(InvalidFilenameError, ({ filename }) => `無効なファイル名: ${filename}`, "ja");

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/utils#invalid-dirname-error)
 */
export type InvalidDirnameErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/utils#invalid-dirname-error)
   */
  readonly dirname: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/utils#invalid-dirname-error)
 */
export type InvalidDirnameErrorArgs = ErrorOptions & InvalidDirnameErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/utils#invalid-dirname-error)
 */
export class InvalidDirnameError extends ErrorBase<InvalidDirnameErrorMeta> {
  static {
    this.prototype.name = "UniKvsInvalidDirnameError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/utils#invalid-dirname-error)
   */
  public constructor(args: InvalidDirnameErrorArgs) {
    const { dirname, ...options } = args;
    const meta: InvalidDirnameErrorMeta = { dirname };
    super(meta, ({ dirname }) => `Invalid directory name: ${dirname}`, options);
  }
}

setErrorMessage(InvalidDirnameError, ({ dirname }) => `無効なディレクトリー名: ${dirname}`, "ja");
