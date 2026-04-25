import { ErrorBase, setErrorMessage, type ErrorOptions } from "@unikvs/core";

export type ChecksumMismatchErrorMeta = {
  readonly actual: string;
  readonly expected: string;
};

export type ChecksumMismatchErrorArgs = ChecksumMismatchErrorMeta;

export class ChecksumMismatchError extends ErrorBase<ChecksumMismatchErrorMeta> {
  static {
    this.prototype.name = "UniKvsChecksumMismatchError";
  }

  public constructor(args: ChecksumMismatchErrorArgs, options?: ErrorOptions) {
    super(args, ({ actual, expected }) => `Expected ${expected}, but got ${actual}`, options);
  }
}

setErrorMessage(
  ChecksumMismatchError,
  ({ actual, expected }) => `${expected} を期待しましたが、${actual} を得ました`,
  "ja",
);
