import { type ErrorOptions, ErrorBase, setErrorMessage, InvalidUsageErrorBase } from "@unikvs/core";
import { inspect } from "inspect-lite";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#errors)
 */
export type ChecksumMismatchErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#errors)
   */
  readonly actual: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#errors)
   */
  readonly expected: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#errors)
 */
export type ChecksumMismatchErrorArgs = ErrorOptions & ChecksumMismatchErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#errors)
 */
export class ChecksumMismatchError extends ErrorBase<ChecksumMismatchErrorMeta> {
  static {
    this.prototype.name = "UniKvsChecksumMismatchError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#errors)
   */
  public constructor(args: ChecksumMismatchErrorArgs) {
    const { actual, expected, ...options } = args;
    const meta: ChecksumMismatchErrorMeta = {
      actual,
      expected,
    };
    super(
      meta,
      ({ actual: actualValue, expected: expectedValue }) =>
        `Expected ${expectedValue}, but got ${actualValue}`,
      options,
    );
  }
}

setErrorMessage(
  ChecksumMismatchError,
  ({ actual, expected }) => `${expected} を期待しましたが、${actual} を得ました`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#errors)
 */
export type ChecksumInvalidVarNameErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#errors)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#errors)
 */
export type ChecksumInvalidVarNameErrorArgs = ErrorOptions & ChecksumInvalidVarNameErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#errors)
 */
export class ChecksumInvalidVarNameError extends InvalidUsageErrorBase<ChecksumInvalidVarNameErrorMeta> {
  static {
    this.prototype.name = "UniKvsChecksumInvalidVarNameError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#errors)
   */
  public constructor(args: ChecksumInvalidVarNameErrorArgs) {
    const { actual, ...options } = args;
    const meta: ChecksumInvalidVarNameErrorMeta = { actual };
    super(meta, ({ actual: actualValue }) => `Invalid vars key: ${inspect(actualValue)}`, options);
  }
}

setErrorMessage(
  ChecksumInvalidVarNameError,
  ({ actual }) => `無効な変数キー: ${inspect(actual)}`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#errors)
 */
export class ChecksumRequiredError extends ErrorBase<undefined> {
  static {
    this.prototype.name = "ChecksumRequiredError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#errors)
   */
  public constructor(options?: ErrorOptions) {
    super("Checksum is required", options);
  }
}

setErrorMessage(ChecksumRequiredError, "チェックサムは必須です", "ja");

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#errors)
 */
export type ChecksumInvalidRequiredErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#errors)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#errors)
 */
export type ChecksumInvalidRequiredErrorArgs = ErrorOptions & ChecksumInvalidRequiredErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#errors)
 */
export class ChecksumInvalidRequiredError extends InvalidUsageErrorBase<ChecksumInvalidRequiredErrorMeta> {
  static {
    this.prototype.name = "UniKvsChecksumInvalidRequiredError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#errors)
   */
  public constructor(args: ChecksumInvalidRequiredErrorArgs) {
    const { actual, ...options } = args;
    const meta: ChecksumInvalidRequiredErrorMeta = { actual };
    super(
      meta,
      ({ actual: actualValue }) => `Invalid checksum required option: ${inspect(actualValue)}`,
      options,
    );
  }
}

setErrorMessage(
  ChecksumInvalidRequiredError,
  ({ actual }) => `無効な checksum required オプション: ${inspect(actual)}`,
  "ja",
);
