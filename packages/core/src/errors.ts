import { type ErrorMeta, I18nErrorBase, setErrorMessage, type ErrorOptions } from "i18n-error-base";

// -------------------------------------------------------------------------------------------------
//
// ユーティリティー
//
// -------------------------------------------------------------------------------------------------

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#errors-message)
 */
export { setErrorMessage };

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#errors)
 */
export type { ErrorMeta };

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#errors)
 */
export type { ErrorOptions };

// -------------------------------------------------------------------------------------------------
//
// 基本
//
// -------------------------------------------------------------------------------------------------

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#errors-base)
 */
export class ErrorBase<
  TMeta extends ErrorMeta | undefined = ErrorMeta | undefined,
> extends I18nErrorBase<TMeta> {}

// -------------------------------------------------------------------------------------------------
//
// 境界エラー
//
// -------------------------------------------------------------------------------------------------

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#errors-invalid-usage)
 */
export class InvalidUsageErrorBase<
  TMeta extends ErrorMeta | undefined = ErrorMeta | undefined,
> extends ErrorBase<TMeta> {}

// -------------------------------------------------------------------------------------------------
//
// 共通エラー
//
// -------------------------------------------------------------------------------------------------

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#errors)
 */
export type KeyNotFoundErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#errors)
   */
  readonly key: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#errors)
 */
export type KeyNotFoundErrorArgs = ErrorOptions & KeyNotFoundErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#errors)
 */
export class KeyNotFoundError extends ErrorBase<KeyNotFoundErrorMeta> {
  static {
    this.prototype.name = "UniKvsKeyNotFoundError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#errors)
   */
  public constructor(args: KeyNotFoundErrorArgs) {
    const { key, ...options } = args;
    const meta: KeyNotFoundErrorMeta = { key };
    super(meta, ({ key }) => `Key not found: ${key}`, options);
  }
}

setErrorMessage(KeyNotFoundError, ({ key }) => `キー ${key} が見つかりません`, "ja");

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#errors)
 */
export type UnsupportedRuntimeErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#errors)
   */
  readonly name: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#errors)
   */
  readonly runtime: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#errors)
 */
export type UnsupportedRuntimeErrorArgs = ErrorOptions & UnsupportedRuntimeErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#errors)
 */
export class UnsupportedRuntimeError extends InvalidUsageErrorBase<UnsupportedRuntimeErrorMeta> {
  static {
    this.prototype.name = "UniKvsUnsupportedRuntimeError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#errors)
   */
  public constructor(args: UnsupportedRuntimeErrorArgs) {
    const { name, runtime, ...options } = args;
    const meta: UnsupportedRuntimeErrorMeta = { name, runtime };
    super(meta, ({ name, runtime }) => `${name} can only be used in the ${runtime} runtime`, options);
  }
}

setErrorMessage(
  UnsupportedRuntimeError,
  ({ name, runtime }) => `${name} は ${runtime} ランタイムでのみ使用できます`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#errors)
 */
export type InvalidPartSizeErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#errors)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#errors)
 */
export type InvalidPartSizeErrorArgs = ErrorOptions & InvalidPartSizeErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#errors)
 */
export class InvalidPartSizeError extends ErrorBase<InvalidPartSizeErrorMeta> {
  static {
    this.prototype.name = "UniKvsInvalidPartSizeError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#errors)
   */
  public constructor(args: InvalidPartSizeErrorArgs) {
    const { actual, ...options } = args;
    const meta: InvalidPartSizeErrorMeta = { actual };
    super(
      meta,
      ({ actual }) =>
        `Invalid part size ${String(actual)} was specified in the vars. A non-integer or non-positive value cannot be used as a multipart upload part size, causing unpredictable upload behavior. Specify a positive integer in bytes such as ${5 * 1024 * 1024}.`,
      options,
    );
  }
}

setErrorMessage(
  InvalidPartSizeError,
  ({ actual }) =>
    `変数に無効なパートサイズ ${String(actual)} が指定されました。整数でも正数でもない値はマルチパートアップロードのパートサイズとして使用できず、予測できない挙動を引き起こします。${5 * 1024 * 1024} などの正の整数 (バイト単位) を指定してください`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#errors)
 */
export type StorageAbortedErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#errors)
   */
  readonly key: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#errors)
 */
export type StorageAbortedErrorArgs = ErrorOptions & StorageAbortedErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#errors)
 */
export class StorageAbortedError extends ErrorBase<StorageAbortedErrorMeta> {
  static {
    this.prototype.name = "UniKvsStorageAbortedError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#errors)
   */
  public constructor(args: StorageAbortedErrorArgs) {
    const { key, ...options } = args;
    const meta: StorageAbortedErrorMeta = { key };
    super(
      meta,
      ({ key }) =>
        `The upload for key ${JSON.stringify(key)} was aborted before it started because the given abort signal was already signaled. Starting an upload with an already aborted signal can never succeed, so it is rejected immediately. Pass a signal that is not aborted, or check the signal state before requesting a writable stream.`,
      options,
    );
  }
}

setErrorMessage(
  StorageAbortedError,
  ({ key }) =>
    `キー ${JSON.stringify(key)} のアップロードは、渡された中断シグナルが既に中断されているため開始前に中止されました。既に中断済みのシグナルではアップロードを成功させられないため、即座に拒否されます。中断されていないシグナルを渡すか、書き込みストリームを要求する前にシグナルの状態を確認してください`,
  "ja",
);

// -------------------------------------------------------------------------------------------------
//
// 書き戻しの拒否
//
// -------------------------------------------------------------------------------------------------

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#errors)
 */
export type RepairNotAllowedErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#errors)
   */
  readonly name: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#errors)
 */
export type RepairNotAllowedErrorArgs = ErrorOptions & RepairNotAllowedErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#errors)
 */
export class RepairNotAllowedError extends ErrorBase<RepairNotAllowedErrorMeta> {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core#errors)
   */
  public constructor(args: RepairNotAllowedErrorArgs) {
    const { name, ...options } = args;
    const meta: RepairNotAllowedErrorMeta = { name };
    super(meta, ({ name }) => `Storage "${name}" does not allow repair writes`, options);
  }
}

setErrorMessage(
  RepairNotAllowedError,
  ({ name }) => `ストレージ "${name}" は書き戻しを許可していません`,
  "ja",
);
