import {
  setErrorMessage,
  ErrorBase,
  type ErrorOptions,
  type ErrorMeta,
  type IStorage,
} from "@unikvs/core";
import type { BaseIssue } from "valibot";

// -------------------------------------------------------------------------------------------------
//
// 境界エラー
//
// -------------------------------------------------------------------------------------------------

export class InvalidUsageErrorBase<
  TMeta extends ErrorMeta | undefined = ErrorMeta | undefined,
> extends ErrorBase<TMeta> {}

// -------------------------------------------------------------------------------------------------

export type Issue = BaseIssue<unknown>;

export type InvalidInputErrorMeta = {
  readonly input: unknown;
  readonly issues: readonly [Issue, ...Issue[]];
};

export type InvalidInputErrorArgs = {
  readonly value: unknown;
  readonly issues: readonly [Issue, ...Issue[]];
};

export class InvalidInputError extends InvalidUsageErrorBase<InvalidInputErrorMeta> {
  static {
    this.prototype.name = "UniKvsInvalidInputError";
  }

  public constructor(args: InvalidInputErrorArgs, options?: ErrorOptions) {
    const { value: input, issues } = args;
    super({ input, issues }, ({ issues }) => issues.map((i) => i.message).join(": "), options);
  }
}

// -------------------------------------------------------------------------------------------------

export type InvalidOutputErrorMeta = {
  readonly output: unknown;
  readonly issues: readonly [Issue, ...Issue[]];
};

export type InvalidOutputErrorArgs = {
  readonly value: unknown;
  readonly issues: readonly [Issue, ...Issue[]];
};

export class InvalidOutputError extends InvalidUsageErrorBase<InvalidOutputErrorMeta> {
  static {
    this.prototype.name = "UniKvsInvalidOutputError";
  }

  public constructor(args: InvalidOutputErrorArgs, options?: ErrorOptions) {
    const { value: output, issues } = args;
    super({ output, issues }, ({ issues }) => issues.map((i) => i.message).join(": "), options);
  }
}

// -------------------------------------------------------------------------------------------------
//
// UniKvs
//
// -------------------------------------------------------------------------------------------------

export class UniKvsIsOpenError extends ErrorBase<undefined> {
  static {
    this.prototype.name = "UniKvsIsOpenError";
  }

  public constructor(options?: ErrorOptions) {
    super("UniKvs is open", options);
  }
}

setErrorMessage(UniKvsIsOpenError, "UniKvs は開いています", "ja");

export class UniKvsIsNotOpenError extends ErrorBase<undefined> {
  static {
    this.prototype.name = "UniKvsIsNotOpenError";
  }

  public constructor(options?: ErrorOptions) {
    super("UniKvs is not open", options);
  }
}

setErrorMessage(UniKvsIsNotOpenError, "UniKvs は開いていません", "ja");

export type KeyNotFoundErrorMeta = {
  readonly key: IStorage.Key;
};

export type KeyNotFoundErrorArgs = KeyNotFoundErrorMeta;

export class KeyNotFoundError extends ErrorBase<KeyNotFoundErrorMeta> {
  static {
    this.prototype.name = "UniKvsKeyNotFoundError";
  }

  public constructor(args: KeyNotFoundErrorArgs, options?: ErrorOptions) {
    super(args, ({ key }) => `IStorage.Key ${JSON.stringify(key)} not found`, options);
  }
}

setErrorMessage(
  KeyNotFoundError,
  ({ key }) => `キー ${JSON.stringify(key)} が見つかりません`,
  "ja",
);

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

export type StorageIsNotOpenErrorMeta = {
  readonly name: string;
};

export type StorageIsNotOpenErrorArgs = StorageIsNotOpenErrorMeta;

export class StorageIsNotOpenError extends ErrorBase<StorageIsNotOpenErrorMeta> {
  static {
    this.prototype.name = "UniKvsStorageIsNotOpenError";
  }

  public constructor(args: StorageIsNotOpenErrorArgs, options?: ErrorOptions) {
    super(args, ({ name }) => `Storage "${name}" is not open`, options);
  }
}

setErrorMessage(StorageIsNotOpenError, ({ name }) => `ストレージ "${name}" は開いていません`, "ja");

export type WritableStreamNotSupportedErrorMeta = {
  readonly name: string;
};

export type WritableStreamNotSupportedErrorArgs = WritableStreamNotSupportedErrorMeta;

export class WritableStreamNotSupportedError extends ErrorBase<WritableStreamNotSupportedErrorMeta> {
  static {
    this.prototype.name = "UniKvsWritableStreamNotSupportedError";
  }

  public constructor(args: WritableStreamNotSupportedErrorArgs, options?: ErrorOptions) {
    super(args, ({ name }) => `Storage "${name}" does not support writable stream`, options);
  }
}

setErrorMessage(
  StorageIsNotOpenError,
  ({ name }) => `ストレージ "${name}" は書き込み可能なストリームをサポートしていません`,
  "ja",
);

export type ReadableStreamNotSupportedErrorMeta = {
  readonly name: string;
};

export type ReadableStreamNotSupportedErrorArgs = ReadableStreamNotSupportedErrorMeta;

export class ReadableStreamNotSupportedError extends ErrorBase<ReadableStreamNotSupportedErrorMeta> {
  static {
    this.prototype.name = "UniKvsReadableStreamNotSupportedError";
  }

  public constructor(args: ReadableStreamNotSupportedErrorArgs, options?: ErrorOptions) {
    super(args, ({ name }) => `Storage "${name}" does not support readable stream`, options);
  }
}

setErrorMessage(
  StorageIsNotOpenError,
  ({ name }) => `ストレージ "${name}" は読み取り可能なストリームをサポートしていません`,
  "ja",
);

export type MultipartWriteNotSupportedErrorMeta = {
  readonly name: string;
};

export type MultipartWriteNotSupportedErrorArgs = MultipartWriteNotSupportedErrorMeta;

export class MultipartWriteNotSupportedError extends ErrorBase<MultipartWriteNotSupportedErrorMeta> {
  static {
    this.prototype.name = "UniKvsMultipartWriteNotSupportedError";
  }

  public constructor(args: MultipartWriteNotSupportedErrorArgs, options?: ErrorOptions) {
    super(args, ({ name }) => `Storage "${name}" does not support multipart-write`, options);
  }
}

setErrorMessage(
  StorageIsNotOpenError,
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

export type TransformerIsNotOpenErrorMeta = {
  readonly name: string;
};

export type TransformerIsNotOpenErrorArgs = TransformerIsNotOpenErrorMeta;

export class TransformerIsNotOpenError extends ErrorBase<TransformerIsNotOpenErrorMeta> {
  static {
    this.prototype.name = "UniKvsTransformerIsNotOpenError";
  }

  public constructor(args: TransformerIsNotOpenErrorArgs, options?: ErrorOptions) {
    super(args, ({ name }) => `Transformer "${name}" is not open`, options);
  }
}

setErrorMessage(
  TransformerIsNotOpenError,
  ({ name }) => `トランスフォーマー "${name}" は開いていません`,
  "ja",
);

export type EncodableStreamNotSupportedErrorMeta = {
  readonly name: string;
};

export type EncodableStreamNotSupportedErrorArgs = EncodableStreamNotSupportedErrorMeta;

export class EncodableStreamNotSupportedError extends ErrorBase<EncodableStreamNotSupportedErrorMeta> {
  static {
    this.prototype.name = "UniKvsEncodableStreamNotSupportedError";
  }

  public constructor(args: EncodableStreamNotSupportedErrorArgs, options?: ErrorOptions) {
    super(args, ({ name }) => `Transformer "${name}" does not support encodable stream`, options);
  }
}

setErrorMessage(
  TransformerIsNotOpenError,
  ({ name }) => `トランスフォーマー "${name}" はエンコード可能なストリームをサポートしていません`,
  "ja",
);

export type DecodableStreamNotSupportedErrorMeta = {
  readonly name: string;
};

export type DecodableStreamNotSupportedErrorArgs = DecodableStreamNotSupportedErrorMeta;

export class DecodableStreamNotSupportedError extends ErrorBase<DecodableStreamNotSupportedErrorMeta> {
  static {
    this.prototype.name = "UniKvsDecodableStreamNotSupportedError";
  }

  public constructor(args: DecodableStreamNotSupportedErrorArgs, options?: ErrorOptions) {
    super(args, ({ name }) => `Transformer "${name}" does not support decodable stream`, options);
  }
}

setErrorMessage(
  TransformerIsNotOpenError,
  ({ name }) => `トランスフォーマー "${name}" はデコード可能なストリームをサポートしていません`,
  "ja",
);

// -------------------------------------------------------------------------------------------------
//
// ストレージ / トランスフォーマー
//
// -------------------------------------------------------------------------------------------------

export type PluginOperationAggregateErrorMeta = {
  readonly plugin: "plugin" | "storage" | "transformer";
  readonly action: "open" | "close" | "write" | "delete" | "clear";
  readonly errors: readonly {
    readonly plugin: "storage" | "transformer";
    readonly reason: unknown;
  }[];
};

export type PluginOperationAggregateErrorArgs = {
  readonly plugin?: "storage" | "transformer";
  readonly action: "open" | "close" | "write" | "delete" | "clear";
  readonly errors: readonly {
    readonly plugin?: "storage" | "transformer";
    readonly reason: unknown;
  }[];
};

export class PluginOperationAggregateError extends ErrorBase<PluginOperationAggregateErrorMeta> {
  static {
    this.prototype.name = "UniKvsPluginOperationAggregateError";
  }

  public constructor(args: PluginOperationAggregateErrorArgs, options?: ErrorOptions) {
    const errors = args.errors.map((error) => ({
      plugin: error.plugin ?? args.plugin ?? ("" as never),
      reason: error.reason,
    }));
    const plugins = [...new Set(errors.map((error) => error.plugin))];
    super(
      {
        plugin: plugins.length === 1 ? plugins[0]! : "plugin",
        action: args.action,
        errors,
      },
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

// -------------------------------------------------------------------------------------------------

export class TransformerRegistrationError extends ErrorBase<undefined> {
  static {
    this.prototype.name = "UniKvsTransformerRegistrationError";
  }

  public constructor(options?: ErrorOptions) {
    super("Cannot add transformers after storage has already been registered", options);
  }
}

setErrorMessage(
  MissingStorageError,
  "ストレージが登録された後にトランスフォーマーを追加することはできません",
  "ja",
);
