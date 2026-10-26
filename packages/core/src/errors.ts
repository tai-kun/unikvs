import { type ErrorMeta, type ErrorOptions, I18nErrorBase, setErrorMessage } from "i18n-error-base";

export { type ErrorMeta, type ErrorOptions, setErrorMessage };

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/errors#errors-base)
 */
export class ErrorBase<
  TMeta extends ErrorMeta | undefined = ErrorMeta | undefined,
> extends I18nErrorBase<TMeta> {}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/errors#errors-base)
 */
export class InvalidUsageErrorBase<
  TMeta extends ErrorMeta | undefined = ErrorMeta | undefined,
> extends ErrorBase<TMeta> {}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/errors#error-key-not-found)
 */
export type KeyNotFoundErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/errors#key-not-found-key)
   */
  readonly key: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/errors#error-key-not-found)
 */
export type KeyNotFoundErrorArgs = ErrorOptions & KeyNotFoundErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/errors#error-key-not-found)
 */
export class KeyNotFoundError extends ErrorBase<KeyNotFoundErrorMeta> {
  static {
    this.prototype.name = "UniKvsKeyNotFoundError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/errors#error-key-not-found)
   */
  public constructor(args: KeyNotFoundErrorArgs) {
    const { key, ...options } = args;
    const meta: KeyNotFoundErrorMeta = { key };
    super(meta, ({ key: messageKey }) => `Key not found: ${messageKey}`, options);
  }
}

setErrorMessage(KeyNotFoundError, ({ key }) => `キー ${key} が見つかりません`, "ja");

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/errors#error-unsupported-runtime)
 */
export type UnsupportedRuntimeErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/errors#unsupported-runtime-name)
   */
  readonly name: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/errors#unsupported-runtime-runtime)
   */
  readonly runtime: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/errors#error-unsupported-runtime)
 */
export type UnsupportedRuntimeErrorArgs = ErrorOptions & UnsupportedRuntimeErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/errors#error-unsupported-runtime)
 */
export class UnsupportedRuntimeError extends InvalidUsageErrorBase<UnsupportedRuntimeErrorMeta> {
  static {
    this.prototype.name = "UniKvsUnsupportedRuntimeError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/errors#error-unsupported-runtime)
   */
  public constructor(args: UnsupportedRuntimeErrorArgs) {
    const { name, runtime, ...options } = args;
    const meta: UnsupportedRuntimeErrorMeta = {
      name,
      runtime,
    };
    super(
      meta,
      ({ name: errorName, runtime: errorRuntime }) =>
        `${errorName} can only be used in the ${errorRuntime} runtime`,
      options,
    );
  }
}

setErrorMessage(
  UnsupportedRuntimeError,
  ({ name, runtime }) => `${name} は ${runtime} ランタイムでのみ使用できます`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/errors#error-invalid-part-size)
 */
export type InvalidPartSizeErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/errors#invalid-part-size-actual)
   */
  readonly actual: unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/errors#error-invalid-part-size)
 */
export type InvalidPartSizeErrorArgs = ErrorOptions & InvalidPartSizeErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/errors#error-invalid-part-size)
 */
export class InvalidPartSizeError extends ErrorBase<InvalidPartSizeErrorMeta> {
  static {
    this.prototype.name = "UniKvsInvalidPartSizeError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/errors#error-invalid-part-size)
   */
  public constructor(args: InvalidPartSizeErrorArgs) {
    const { actual, ...options } = args;
    const meta: InvalidPartSizeErrorMeta = { actual };
    super(
      meta,
      ({ actual: actualValue }) =>
        `Invalid part size ${String(actualValue)} was specified in the vars. A non-integer or non-positive value cannot be used as a multipart upload part size, causing unpredictable upload behavior. Specify a positive integer in bytes such as ${5 * 1024 * 1024}.`,
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
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/errors#error-storage-aborted)
 */
export type StorageAbortedErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/errors#storage-aborted-key)
   */
  readonly key: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/errors#error-storage-aborted)
 */
export type StorageAbortedErrorArgs = ErrorOptions & StorageAbortedErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/errors#error-storage-aborted)
 */
export class StorageAbortedError extends ErrorBase<StorageAbortedErrorMeta> {
  static {
    this.prototype.name = "UniKvsStorageAbortedError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/errors#error-storage-aborted)
   */
  public constructor(args: StorageAbortedErrorArgs) {
    const { key, ...options } = args;
    const meta: StorageAbortedErrorMeta = { key };
    super(
      meta,
      ({ key: abortedKey }) =>
        `The upload for key ${JSON.stringify(abortedKey)} was aborted before it started because the given abort signal was already signaled. Starting an upload with an already aborted signal can never succeed, so it is rejected immediately. Pass a signal that is not aborted, or check the signal state before requesting a writable stream.`,
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

// -------------------------------------------------------------------------------------------------。
//
// 書き戻しの拒否。
//
// -------------------------------------------------------------------------------------------------。

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/errors#error-repair-not-allowed)
 */
export type RepairNotAllowedErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/errors#repair-not-allowed-names)
   */
  readonly names: readonly string[];
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/errors#error-repair-not-allowed)
 */
export type RepairNotAllowedErrorArgs = ErrorOptions & RepairNotAllowedErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/errors#error-repair-not-allowed)
 */
export class RepairNotAllowedError extends ErrorBase<RepairNotAllowedErrorMeta> {
  static {
    this.prototype.name = "UniKvsRepairNotAllowedError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/errors#error-repair-not-allowed)
   */
  public constructor(args: RepairNotAllowedErrorArgs) {
    const { names, ...options } = args;
    const meta: RepairNotAllowedErrorMeta = { names: Object.freeze([...names]) };
    super(
      meta,
      ({ names: repairNames }) =>
        `Repair writes via "${formatRepairNames(repairNames)}" are not allowed`,
      options,
    );
  }
}

// 書き戻し拒否の表示名を組み立てます。
// 空のときは不明名を返します。
/**
 * 書き戻し拒否先の一覧を表示用の文字列にまとめます。
 *
 * 空の一覧では不明名を返します。
 *
 * @param names 書き戻し先の名前一覧です。
 *
 * @returns 表示用の名前文字列です。
 */
function formatRepairNames(names: readonly string[]): string {
  const joined = names.join(", ");

  return joined !== "" ? joined : "(unknown)";
}

setErrorMessage(
  RepairNotAllowedError,
  ({ names }) => `"${formatRepairNames(names)}" への書き戻しは許可されていません`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/errors#error-readonly-variable)
 */
export type ReadonlyVariableErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/errors#readonly-variable-name)
   */
  readonly name: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/errors#error-readonly-variable)
 */
export type ReadonlyVariableErrorArgs = ErrorOptions & ReadonlyVariableErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/errors#error-readonly-variable)
 */
export class ReadonlyVariableError extends InvalidUsageErrorBase<ReadonlyVariableErrorMeta> {
  static {
    this.prototype.name = "UniKvsReadonlyVariableError";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/errors#error-readonly-variable)
   */
  public constructor(args: ReadonlyVariableErrorArgs) {
    const { name, ...options } = args;
    const meta: ReadonlyVariableErrorMeta = { name };
    super(
      meta,
      ({ name: variableName }) =>
        `Cannot modify readonly variable: ${JSON.stringify(variableName)}`,
      options,
    );
  }
}

setErrorMessage(
  ReadonlyVariableError,
  ({ name }) => `読み取り専用の変数 ${JSON.stringify(name)} は変更できません`,
  "ja",
);
