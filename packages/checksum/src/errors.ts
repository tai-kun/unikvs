import { ErrorBase, setErrorMessage, type ErrorOptions } from "@unikvs/core";
import { inspect } from "inspect-lite";

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

export type ChecksumInvalidContextKeyErrorMeta = {
  readonly actual: unknown;
};

export type ChecksumInvalidContextKeyErrorArgs = ChecksumInvalidContextKeyErrorMeta;

export class ChecksumInvalidContextKeyError extends ErrorBase<ChecksumInvalidContextKeyErrorMeta> {
  static {
    this.prototype.name = "UniKvsChecksumInvalidContextKeyError";
  }

  public constructor(args: ChecksumInvalidContextKeyErrorArgs, options?: ErrorOptions) {
    super(args, ({ actual }) => `Invalid context key: ${inspect(actual)}`, options);
  }
}

setErrorMessage(
  ChecksumInvalidContextKeyError,
  ({ actual }) => `無効なコンテクストキー: ${inspect(actual)}`,
  "ja",
);

export class ChecksumRequiredError extends ErrorBase<undefined> {
  static {
    this.prototype.name = "ChecksumRequiredError";
  }

  public constructor(options?: ErrorOptions) {
    super("Checksum is required", options);
  }
}

setErrorMessage(ChecksumRequiredError, "チェックサムは必須です", "ja");
