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

/**
 * 無効な入出力を表すエラーの基底クラスです。
 *
 * @template TMeta エラーのメタデータの型です。
 */
export class InvalidUsageErrorBase<
  TMeta extends ErrorMeta | undefined = ErrorMeta | undefined,
> extends ErrorBase<TMeta> {}

// -------------------------------------------------------------------------------------------------

/**
 * バリデーションの問題を表す valibot のイシューです。
 */
export type Issue = BaseIssue<unknown>;

/**
 * InvalidInputError に付与されるメタデータです。
 */
export type InvalidInputErrorMeta = {
  /**
   * 検証に失敗した入力値です。
   */
  readonly input: unknown;

  /**
   * 検証で検出されたイシューのリストです。
   */
  readonly issues: readonly [Issue, ...Issue[]];
};

/**
 * InvalidInputError のコンストラクター引数です。
 *
 * エラーの追加情報 (`cause`) も含みます。
 */
export type InvalidInputErrorArgs = ErrorOptions & {
  /**
   * 検証の対象となった値です。
   */
  readonly value: unknown;

  /**
   * 検証で検出されたイシューのリストです。
   */
  readonly issues: readonly [Issue, ...Issue[]];
};

/**
 * 入力値が期待するスキーマに適合しない場合に投げられるエラーです。
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
 * InvalidOutputError に付与されるメタデータです。
 */
export type InvalidOutputErrorMeta = {
  /**
   * 検証に失敗した出力値です。
   */
  readonly output: unknown;

  /**
   * 検証で検出されたイシューのリストです。
   */
  readonly issues: readonly [Issue, ...Issue[]];
};

/**
 * InvalidOutputError のコンストラクター引数です。
 *
 * エラーの追加情報 (`cause`) も含みます。
 */
export type InvalidOutputErrorArgs = ErrorOptions & {
  /**
   * 検証の対象となった値です。
   */
  readonly value: unknown;

  /**
   * 検証で検出されたイシューのリストです。
   */
  readonly issues: readonly [Issue, ...Issue[]];
};

/**
 * 出力値が期待するスキーマに適合しない場合に投げられるエラーです。
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
 * すでに開いている UniKvs に対して再度オープン操作が行われた場合に投げられるエラーです。
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
 * UniKvs が開かれていない状態で操作が行われた場合に投げられるエラーです。
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

/**
 * KeyNotFoundError に付与されるメタデータです。
 */
export type KeyNotFoundErrorMeta = {
  /**
   * 見つからなかったキーです。
   */
  readonly key: IStorage.Key;
};

/**
 * KeyNotFoundError のコンストラクター引数です。
 *
 * エラーの追加情報 (`cause`) も含みます。
 */
export type KeyNotFoundErrorArgs = ErrorOptions & KeyNotFoundErrorMeta;

/**
 * 指定したキーのデータがどのストレージにも存在しない場合に投げられるエラーです。
 */
export class KeyNotFoundError extends ErrorBase<KeyNotFoundErrorMeta> {
  static {
    this.prototype.name = "UniKvsKeyNotFoundError";
  }

  public constructor(args: KeyNotFoundErrorArgs) {
    const { key, ...options } = args;
    const meta: KeyNotFoundErrorMeta = { key };
    super(meta, ({ key }) => `IStorage.Key ${JSON.stringify(key)} not found`, options);
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

/**
 * StorageIsNotOpenError に付与されるメタデータです。
 */
export type StorageIsNotOpenErrorMeta = {
  /**
   * 開かれていないストレージの名前です。
   */
  readonly name: string;
};

/**
 * StorageIsNotOpenError のコンストラクター引数です。
 *
 * エラーの追加情報 (`cause`) も含みます。
 */
export type StorageIsNotOpenErrorArgs = ErrorOptions & StorageIsNotOpenErrorMeta;

/**
 * ストレージが開かれていない状態で操作が行われた場合に投げられるエラーです。
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
 * WritableStreamNotSupportedError に付与されるメタデータです。
 */
export type WritableStreamNotSupportedErrorMeta = {
  /**
   * 対象のストレージの名前です。
   */
  readonly name: string;
};

/**
 * WritableStreamNotSupportedError のコンストラクター引数です。
 *
 * エラーの追加情報 (`cause`) も含みます。
 */
export type WritableStreamNotSupportedErrorArgs = ErrorOptions &
  WritableStreamNotSupportedErrorMeta;

/**
 * ストレージが書き込み可能なストリームをサポートしていない場合に投げられるエラーです。
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
 * ReadableStreamNotSupportedError に付与されるメタデータです。
 */
export type ReadableStreamNotSupportedErrorMeta = {
  /**
   * 対象のストレージの名前です。
   */
  readonly name: string;
};

/**
 * ReadableStreamNotSupportedError のコンストラクター引数です。
 *
 * エラーの追加情報 (`cause`) も含みます。
 */
export type ReadableStreamNotSupportedErrorArgs = ErrorOptions &
  ReadableStreamNotSupportedErrorMeta;

/**
 * ストレージが読み取り可能なストリームをサポートしていない場合に投げられるエラーです。
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
 * TransformerIsNotOpenError に付与されるメタデータです。
 */
export type TransformerIsNotOpenErrorMeta = {
  /**
   * 開かれていないトランスフォーマーの名前です。
   */
  readonly name: string;
};

/**
 * TransformerIsNotOpenError のコンストラクター引数です。
 *
 * エラーの追加情報 (`cause`) も含みます。
 */
export type TransformerIsNotOpenErrorArgs = ErrorOptions & TransformerIsNotOpenErrorMeta;

/**
 * トランスフォーマーが開かれていない状態で操作が行われた場合に投げられるエラーです。
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
 * EncodableStreamNotSupportedError に付与されるメタデータです。
 */
export type EncodableStreamNotSupportedErrorMeta = {
  /**
   * 対象のトランスフォーマーの名前です。
   */
  readonly name: string;
};

/**
 * EncodableStreamNotSupportedError のコンストラクター引数です。
 *
 * エラーの追加情報 (`cause`) も含みます。
 */
export type EncodableStreamNotSupportedErrorArgs = ErrorOptions &
  EncodableStreamNotSupportedErrorMeta;

/**
 * トランスフォーマーがエンコード可能なストリームをサポートしていない場合に投げられるエラーです。
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
 * DecodableStreamNotSupportedError に付与されるメタデータです。
 */
export type DecodableStreamNotSupportedErrorMeta = {
  /**
   * 対象のトランスフォーマーの名前です。
   */
  readonly name: string;
};

/**
 * DecodableStreamNotSupportedError のコンストラクター引数です。
 *
 * エラーの追加情報 (`cause`) も含みます。
 */
export type DecodableStreamNotSupportedErrorArgs = ErrorOptions &
  DecodableStreamNotSupportedErrorMeta;

/**
 * トランスフォーマーがデコード可能なストリームをサポートしていない場合に投げられるエラーです。
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
 * PluginOperationAggregateError に付与されるメタデータです。
 */
export type PluginOperationAggregateErrorMeta = {
  /**
   * 失敗した操作の対象となったプラグインの種別です。
   *
   * - `"plugin"`: 複数の種別のプラグインが混在しています。
   * - `"storage"`: ストレージです。
   * - `"transformer"`: トランスフォーマーです。
   */
  readonly plugin: "plugin" | "storage" | "transformer";

  /**
   * 失敗した操作の種類です。
   */
  readonly action: "open" | "close" | "write" | "read" | "delete" | "clear";

  /**
   * 失敗した各プラグインの操作と原因のリストです。
   */
  readonly errors: readonly {
    /**
     * 失敗したプラグインの種別です。
     */
    readonly plugin: "storage" | "transformer";

    /**
     * 操作が失敗した原因です。
     */
    readonly reason: unknown;
  }[];
};

/**
 * PluginOperationAggregateError のコンストラクター引数です。
 *
 * エラーの追加情報 (`cause`) も含みます。
 */
export type PluginOperationAggregateErrorArgs = ErrorOptions & {
  /**
   * 失敗したプラグインの既定の種別です。
   *
   * 個々のエラーで種別が指定されていない場合に使用されます。
   */
  readonly plugin?: "storage" | "transformer";

  /**
   * 失敗した操作の種類です。
   */
  readonly action: "open" | "close" | "write" | "read" | "delete" | "clear";

  /**
   * 失敗した各プラグインの操作と原因のリストです。
   */
  readonly errors: readonly {
    /**
     * 失敗したプラグインの種別です。
     */
    readonly plugin?: "storage" | "transformer";

    /**
     * 操作が失敗した原因です。
     */
    readonly reason: unknown;
  }[];
};

/**
 * 複数のストレージやトランスフォーマーの操作が失敗した場合に投げられる、個々の失敗を集約したエラーです。
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
 * ストレージが一つも登録されていない状態で UniKvs を作成しようとした場合に投げられるエラーです。
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
