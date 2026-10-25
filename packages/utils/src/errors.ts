import { type ErrorOptions, ErrorBase, setErrorMessage } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/utils#invalid-filename-error)
 */
export type InvalidFilenameErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/utils#invalid-filename-filename)
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
    super(
      meta,
      ({ filename: messageFilename }) => `Invalid file name: ${messageFilename}`,
      options,
    );
  }
}

setErrorMessage(
  InvalidFilenameError,
  ({ filename: messageFilename }) => `無効なファイル名: ${messageFilename}`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/utils#invalid-dirname-error)
 */
export type InvalidDirnameErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/utils#invalid-dirname-dirname)
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
    super(
      meta,
      ({ dirname: messageDirname }) => `Invalid directory name: ${messageDirname}`,
      options,
    );
  }
}

setErrorMessage(
  InvalidDirnameError,
  ({ dirname: messageDirname }) => `無効なディレクトリー名: ${messageDirname}`,
  "ja",
);
