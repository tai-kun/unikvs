import {
  InvalidUsageErrorBase,
  KeyNotFoundError,
  setErrorMessage,
  ErrorBase,
  type ErrorOptions,
} from "@unikvs/core";
import type { BaseIssue } from "valibot";

export { InvalidUsageErrorBase, KeyNotFoundError };
export type { KeyNotFoundErrorArgs, KeyNotFoundErrorMeta } from "@unikvs/core";

// -------------------------------------------------------------------------------------------------

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export type Issue = BaseIssue<unknown>;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export type InvalidInputErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
   */
  readonly input: unknown;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
   */
  readonly issues: readonly [Issue, ...Issue[]];
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export type InvalidInputErrorArgs = ErrorOptions & {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
   */
  readonly value: unknown;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
   */
  readonly issues: readonly [Issue, ...Issue[]];
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export class InvalidInputError extends InvalidUsageErrorBase<InvalidInputErrorMeta> {
  static {
    this.prototype.name = "UniKvsInvalidInputError";
  }

  public constructor(args: InvalidInputErrorArgs) {
    const { value: input, issues, ...options } = args;
    const meta: InvalidInputErrorMeta = { input, issues };
    super(meta, ({ issues }) => issues.map((i) => i.message).join(": "), options);
  }
}

// -------------------------------------------------------------------------------------------------

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export type InvalidOutputErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
   */
  readonly output: unknown;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
   */
  readonly issues: readonly [Issue, ...Issue[]];
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export type InvalidOutputErrorArgs = ErrorOptions & {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
   */
  readonly value: unknown;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
   */
  readonly issues: readonly [Issue, ...Issue[]];
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export class InvalidOutputError extends InvalidUsageErrorBase<InvalidOutputErrorMeta> {
  static {
    this.prototype.name = "UniKvsInvalidOutputError";
  }

  public constructor(args: InvalidOutputErrorArgs) {
    const { value: output, issues, ...options } = args;
    const meta: InvalidOutputErrorMeta = { output, issues };
    super(meta, ({ issues }) => issues.map((i) => i.message).join(": "), options);
  }
}

// -------------------------------------------------------------------------------------------------
//
// UniKvs
//
// -------------------------------------------------------------------------------------------------

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export class UniKvsIsOpenError extends ErrorBase<undefined> {
  static {
    this.prototype.name = "UniKvsIsOpenError";
  }

  public constructor(options?: ErrorOptions) {
    super("UniKvs is open", options);
  }
}

setErrorMessage(UniKvsIsOpenError, "UniKvs は開いています", "ja");

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export class UniKvsIsNotOpenError extends ErrorBase<undefined> {
  static {
    this.prototype.name = "UniKvsIsNotOpenError";
  }

  public constructor(options?: ErrorOptions) {
    super("UniKvs is not open", options);
  }
}

setErrorMessage(UniKvsIsNotOpenError, "UniKvs は開いていません", "ja");

// -------------------------------------------------------------------------------------------------
//
// ストレージ
//
// -------------------------------------------------------------------------------------------------

// export type StorageIsOpenErrorMeta = {
//   readonly name: string;
// };

// export type StorageIsOpenErrorArgs = StorageIsOpenErrorMeta;

// export class StorageIsOpenError extends ErrorBase<StorageIsOpenErrorMeta> {
//   static {
//     this.prototype.name = "UniKvsStorageIsOpenError";
//   }

//   public constructor(args: StorageIsOpenErrorArgs, options?: ErrorOptions) {
//     super(args, ({ name }) => `Storage "${name}" is open`, options);
//   }
// }

// setErrorMessage(StorageIsOpenError, ({ name }) => `ストレージ "${name}" は開いています`, "ja");

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export type StorageIsNotOpenErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
   */
  readonly name: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export type StorageIsNotOpenErrorArgs = ErrorOptions & StorageIsNotOpenErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export class StorageIsNotOpenError extends ErrorBase<StorageIsNotOpenErrorMeta> {
  static {
    this.prototype.name = "UniKvsStorageIsNotOpenError";
  }

  public constructor(args: StorageIsNotOpenErrorArgs) {
    const { name, ...options } = args;
    const meta: StorageIsNotOpenErrorMeta = { name };
    super(meta, ({ name }) => `Storage "${name}" is not open`, options);
  }
}

setErrorMessage(StorageIsNotOpenError, ({ name }) => `ストレージ "${name}" は開いていません`, "ja");

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export type WritableStreamNotSupportedErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
   */
  readonly name: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export type WritableStreamNotSupportedErrorArgs = ErrorOptions &
  WritableStreamNotSupportedErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export class WritableStreamNotSupportedError extends ErrorBase<WritableStreamNotSupportedErrorMeta> {
  static {
    this.prototype.name = "UniKvsWritableStreamNotSupportedError";
  }

  public constructor(args: WritableStreamNotSupportedErrorArgs) {
    const { name, ...options } = args;
    const meta: WritableStreamNotSupportedErrorMeta = { name };
    super(meta, ({ name }) => `Storage "${name}" does not support writable stream`, options);
  }
}

setErrorMessage(
  WritableStreamNotSupportedError,
  ({ name }) => `ストレージ "${name}" は書き込み可能なストリームをサポートしていません`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export type ReadableStreamNotSupportedErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
   */
  readonly name: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export type ReadableStreamNotSupportedErrorArgs = ErrorOptions &
  ReadableStreamNotSupportedErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export class ReadableStreamNotSupportedError extends ErrorBase<ReadableStreamNotSupportedErrorMeta> {
  static {
    this.prototype.name = "UniKvsReadableStreamNotSupportedError";
  }

  public constructor(args: ReadableStreamNotSupportedErrorArgs) {
    const { name, ...options } = args;
    const meta: ReadableStreamNotSupportedErrorMeta = { name };
    super(meta, ({ name }) => `Storage "${name}" does not support readable stream`, options);
  }
}

setErrorMessage(
  ReadableStreamNotSupportedError,
  ({ name }) => `ストレージ "${name}" は読み取り可能なストリームをサポートしていません`,
  "ja",
);

/**
 * MultipartWriteNotSupportedError に付与されるメタデータです。
 */
export type MultipartWriteNotSupportedErrorMeta = {
  /**
   * 対象のストレージの名前です。
   */
  readonly name: string;
};

/**
 * MultipartWriteNotSupportedError のコンストラクター引数です。
 *
 * エラーの追加情報 (`cause`) も含みます。
 */
export type MultipartWriteNotSupportedErrorArgs = ErrorOptions &
  MultipartWriteNotSupportedErrorMeta;

/**
 * ストレージがマルチパート書き込みをサポートしていない場合に投げられるエラーです。
 */
export class MultipartWriteNotSupportedError extends ErrorBase<MultipartWriteNotSupportedErrorMeta> {
  static {
    this.prototype.name = "UniKvsMultipartWriteNotSupportedError";
  }

  public constructor(args: MultipartWriteNotSupportedErrorArgs) {
    const { name, ...options } = args;
    const meta: MultipartWriteNotSupportedErrorMeta = { name };
    super(meta, ({ name }) => `Storage "${name}" does not support multipart-write`, options);
  }
}

setErrorMessage(
  MultipartWriteNotSupportedError,
  ({ name }) => `ストレージ "${name}" はマルチパート書き込みをサポートしていません`,
  "ja",
);

// -------------------------------------------------------------------------------------------------
//
// トランスフォーマー
//
// -------------------------------------------------------------------------------------------------

// export type TransformerIsOpenErrorMeta = {
//   readonly name: string;
// };

// export type TransformerIsOpenErrorArgs = TransformerIsOpenErrorMeta;

// export class TransformerIsOpenError extends ErrorBase<TransformerIsOpenErrorMeta> {
//   static {
//     this.prototype.name = "UniKvsTransformerIsOpenError";
//   }

//   public constructor(args: TransformerIsOpenErrorArgs, options?: ErrorOptions) {
//     super(args, ({ name }) => `Transformer "${name}" is open`, options);
//   }
// }

// setErrorMessage(TransformerIsOpenError, ({ name }) => `トランスフォーマー "${name}" は開いています`, "ja");

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export type TransformerIsNotOpenErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
   */
  readonly name: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export type TransformerIsNotOpenErrorArgs = ErrorOptions & TransformerIsNotOpenErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export class TransformerIsNotOpenError extends ErrorBase<TransformerIsNotOpenErrorMeta> {
  static {
    this.prototype.name = "UniKvsTransformerIsNotOpenError";
  }

  public constructor(args: TransformerIsNotOpenErrorArgs) {
    const { name, ...options } = args;
    const meta: TransformerIsNotOpenErrorMeta = { name };
    super(meta, ({ name }) => `Transformer "${name}" is not open`, options);
  }
}

setErrorMessage(
  TransformerIsNotOpenError,
  ({ name }) => `トランスフォーマー "${name}" は開いていません`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export type EncodableStreamNotSupportedErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
   */
  readonly name: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export type EncodableStreamNotSupportedErrorArgs = ErrorOptions &
  EncodableStreamNotSupportedErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export class EncodableStreamNotSupportedError extends ErrorBase<EncodableStreamNotSupportedErrorMeta> {
  static {
    this.prototype.name = "UniKvsEncodableStreamNotSupportedError";
  }

  public constructor(args: EncodableStreamNotSupportedErrorArgs) {
    const { name, ...options } = args;
    const meta: EncodableStreamNotSupportedErrorMeta = { name };
    super(meta, ({ name }) => `Transformer "${name}" does not support encodable stream`, options);
  }
}

setErrorMessage(
  EncodableStreamNotSupportedError,
  ({ name }) => `トランスフォーマー "${name}" はエンコード可能なストリームをサポートしていません`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export type DecodableStreamNotSupportedErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
   */
  readonly name: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export type DecodableStreamNotSupportedErrorArgs = ErrorOptions &
  DecodableStreamNotSupportedErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export class DecodableStreamNotSupportedError extends ErrorBase<DecodableStreamNotSupportedErrorMeta> {
  static {
    this.prototype.name = "UniKvsDecodableStreamNotSupportedError";
  }

  public constructor(args: DecodableStreamNotSupportedErrorArgs) {
    const { name, ...options } = args;
    const meta: DecodableStreamNotSupportedErrorMeta = { name };
    super(meta, ({ name }) => `Transformer "${name}" does not support decodable stream`, options);
  }
}

setErrorMessage(
  DecodableStreamNotSupportedError,
  ({ name }) => `トランスフォーマー "${name}" はデコード可能なストリームをサポートしていません`,
  "ja",
);

// -------------------------------------------------------------------------------------------------
//
// ストレージ / トランスフォーマー
//
// -------------------------------------------------------------------------------------------------

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export type PluginOperationAggregateErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
   */
  readonly plugin: "plugin" | "storage" | "transformer";

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
   */
  readonly action: "open" | "close" | "write" | "read" | "delete" | "clear";

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
   */
  readonly errors: readonly {
    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
     */
    readonly plugin: "storage" | "transformer";

    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
     */
    readonly name?: string;

    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
     */
    readonly index?: number;

    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
     */
    readonly reason: unknown;
  }[];
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export type PluginOperationAggregateErrorArgs = ErrorOptions & {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
   */
  readonly plugin?: "storage" | "transformer";

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
   */
  readonly action: "open" | "close" | "write" | "read" | "delete" | "clear";

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
   */
  readonly errors: readonly {
    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
     */
    readonly plugin?: "storage" | "transformer";

    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
     */
    readonly name?: string;

    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
     */
    readonly index?: number;

    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
     */
    readonly reason: unknown;
  }[];
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export class PluginOperationAggregateError extends ErrorBase<PluginOperationAggregateErrorMeta> {
  static {
    this.prototype.name = "UniKvsPluginOperationAggregateError";
  }

  public constructor(args: PluginOperationAggregateErrorArgs) {
    const { plugin, action, errors, ...options } = args;
    // 個々のエラーで種別が指定されていない場合は、既定の種別で補完します。
    const normalizedErrors = errors.map((error) => ({
      plugin: error.plugin ?? plugin ?? ("" as never),
      ...(error.name !== undefined ? { name: error.name } : {}),
      ...(error.index !== undefined ? { index: error.index } : {}),
      reason: error.reason,
    }));
    const plugins = [...new Set(normalizedErrors.map((error) => error.plugin))];
    const meta: PluginOperationAggregateErrorMeta = {
      plugin: plugins.length === 1 ? plugins[0]! : "plugin",
      action,
      errors: normalizedErrors,
    };
    super(
      meta,
      ({ action, errors, plugin }) => `${errors.length} ${plugin}(s) fail ${action} operation`,
      options,
    );
  }
}

setErrorMessage(
  PluginOperationAggregateError,
  ({ action, errors, plugin }) =>
    `${errors.length} 個の${{ plugin: "プラグイン", storage: "ストレージ", transformer: "トランスフォーマー" }[plugin]}が ${action} 操作に失敗`,
  "ja",
);

// -------------------------------------------------------------------------------------------------
//
// その他
//
// -------------------------------------------------------------------------------------------------

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export class MissingStorageError extends ErrorBase<undefined> {
  static {
    this.prototype.name = "UniKvsMissingStorageError";
  }

  public constructor(options?: ErrorOptions) {
    super("At least one storage is required to use UniKvs", options);
  }
}

setErrorMessage(
  MissingStorageError,
  "UniKvs を使用するためには最低 1 つのストレージが必要です",
  "ja",
);
