import { ErrorBase, setErrorMessage, type ErrorOptions } from "@unikvs/core";

export type InvalidFilenameErrorMeta = {
  readonly filename: string;
};

export type InvalidFilenameErrorArgs = InvalidFilenameErrorMeta;

export class InvalidFilenameError extends ErrorBase<InvalidFilenameErrorMeta> {
  static {
    this.prototype.name = "UniKvsInvalidFilenameError";
  }

  public constructor(args: InvalidFilenameErrorArgs, options?: ErrorOptions) {
    super(args, ({ filename }) => `Invalid file name: ${filename}`, options);
  }
}

setErrorMessage(InvalidFilenameError, ({ filename }) => `無効なファイル名: ${filename}`, "ja");

export type InvalidDirnameErrorMeta = {
  readonly dirname: string;
};

export type InvalidDirnameErrorArgs = InvalidDirnameErrorMeta;

export class InvalidDirnameError extends ErrorBase<InvalidDirnameErrorMeta> {
  static {
    this.prototype.name = "UniKvsInvalidDirnameError";
  }

  public constructor(args: InvalidDirnameErrorArgs, options?: ErrorOptions) {
    super(args, ({ dirname }) => `Invalid directory name: ${dirname}`, options);
  }
}

setErrorMessage(InvalidDirnameError, ({ dirname }) => `無効なディレクトリー名: ${dirname}`, "ja");
