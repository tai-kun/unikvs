import {
  type ErrorOptions,
  ErrorBase,
  setErrorMessage,
  KeyNotFoundError,
  InvalidUsageErrorBase,
} from "@unikvs/core";
import type { BaseIssue } from "valibot";

export { KeyNotFoundError, InvalidUsageErrorBase };
export type { KeyNotFoundErrorArgs, KeyNotFoundErrorMeta } from "@unikvs/core";

// -------------------------------------------------------------------------------------------------。

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
    const meta: InvalidInputErrorMeta = {
      input,
      issues,
    };
    super(
      meta,
      ({ issues: messageIssues }) => messageIssues.map((i) => i.message).join(": "),
      options,
    );
  }
}

// -------------------------------------------------------------------------------------------------。

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
    const meta: InvalidOutputErrorMeta = {
      issues,
      output,
    };
    super(
      meta,
      ({ issues: messageIssues }) => messageIssues.map((i) => i.message).join(": "),
      options,
    );
  }
}

// -------------------------------------------------------------------------------------------------。
//
// UniKvs。
//
// -------------------------------------------------------------------------------------------------。

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

// -------------------------------------------------------------------------------------------------。
//
// ストレージ。
//
// -------------------------------------------------------------------------------------------------。

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
    super(meta, ({ name: messageName }) => `Storage "${messageName}" is not open`, options);
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
    super(
      meta,
      ({ name: messageName }) => `Storage "${messageName}" does not support writable stream`,
      options,
    );
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
    super(
      meta,
      ({ name: messageName }) => `Storage "${messageName}" does not support readable stream`,
      options,
    );
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
    super(
      meta,
      ({ name: messageName }) => `Storage "${messageName}" does not support multipart-write`,
      options,
    );
  }
}

setErrorMessage(
  MultipartWriteNotSupportedError,
  ({ name }) => `ストレージ "${name}" はマルチパート書き込みをサポートしていません`,
  "ja",
);

// -------------------------------------------------------------------------------------------------。
//
// ミドルウェア。
//
// -------------------------------------------------------------------------------------------------。

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export type MiddlewareIsNotOpenErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
   */
  readonly name: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export type MiddlewareIsNotOpenErrorArgs = ErrorOptions & MiddlewareIsNotOpenErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export class MiddlewareIsNotOpenError extends ErrorBase<MiddlewareIsNotOpenErrorMeta> {
  static {
    this.prototype.name = "UniKvsMiddlewareIsNotOpenError";
  }

  public constructor(args: MiddlewareIsNotOpenErrorArgs) {
    const { name, ...options } = args;
    const meta: MiddlewareIsNotOpenErrorMeta = { name };
    super(meta, ({ name: messageName }) => `Middleware "${messageName}" is not open`, options);
  }
}

setErrorMessage(
  MiddlewareIsNotOpenError,
  ({ name }) => `ミドルウェア "${name}" は開いていません`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export type MiddlewareDestinationMissingErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
   */
  readonly name: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
   */
  readonly operation: "encode" | "decode";
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export type MiddlewareDestinationMissingErrorArgs = ErrorOptions &
  MiddlewareDestinationMissingErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export class MiddlewareDestinationMissingError extends ErrorBase<MiddlewareDestinationMissingErrorMeta> {
  static {
    this.prototype.name = "UniKvsMiddlewareDestinationMissingError";
  }

  public constructor(args: MiddlewareDestinationMissingErrorArgs) {
    const { name, operation, ...options } = args;
    const meta: MiddlewareDestinationMissingErrorMeta = {
      name,
      operation,
    };
    super(
      meta,
      ({ name: messageName, operation: messageOperation }) =>
        `Middleware "${messageName}" did not set destination for ${messageOperation}.`,
      options,
    );
  }
}

setErrorMessage(
  MiddlewareDestinationMissingError,
  ({ name, operation }) =>
    `ミドルウェア "${name}" は ${operation} の destination を設定しませんでした。`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export type MiddlewareDestinationFrozenErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
   */
  readonly action: "set" | "get" | "stream";

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
   */
  readonly key: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export type MiddlewareDestinationFrozenErrorArgs = ErrorOptions &
  MiddlewareDestinationFrozenErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export class MiddlewareDestinationFrozenError extends ErrorBase<MiddlewareDestinationFrozenErrorMeta> {
  static {
    this.prototype.name = "UniKvsMiddlewareDestinationFrozenError";
  }

  public constructor(args: MiddlewareDestinationFrozenErrorArgs) {
    const { key, action, ...options } = args;
    const meta: MiddlewareDestinationFrozenErrorMeta = {
      key,
      action,
    };
    super(
      meta,
      ({ key: messageKey, action: messageAction }) =>
        `Cannot set destination after next() was called for ${messageAction} operation on key ${JSON.stringify(messageKey)}.`,
      options,
    );
  }
}

setErrorMessage(
  MiddlewareDestinationFrozenError,
  ({ key: messageKey, action: messageAction }) =>
    `next() を呼び出した後に destination を設定できません（${messageAction} 操作、キー ${JSON.stringify(messageKey)}）。`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export type MiddlewareNextNotCalledErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
   */
  readonly name: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
   */
  readonly operation: "encode" | "decode" | "use";
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export type MiddlewareNextNotCalledErrorArgs = ErrorOptions & MiddlewareNextNotCalledErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export class MiddlewareNextNotCalledError extends ErrorBase<MiddlewareNextNotCalledErrorMeta> {
  static {
    this.prototype.name = "UniKvsMiddlewareNextNotCalledError";
  }

  public constructor(args: MiddlewareNextNotCalledErrorArgs) {
    const { name, operation, ...options } = args;
    const meta: MiddlewareNextNotCalledErrorMeta = {
      name,
      operation,
    };
    super(
      meta,
      ({ name: messageName, operation: messageOperation }) =>
        `Middleware "${messageName}" did not call next() for ${messageOperation}.`,
      options,
    );
  }
}

setErrorMessage(
  MiddlewareNextNotCalledError,
  ({ name, operation }) => `ミドルウェア "${name}" は ${operation} で next() を呼びませんでした。`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export type MiddlewareNextNotAwaitedErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
   */
  readonly name: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
   */
  readonly operation: "encode" | "decode" | "use";
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export type MiddlewareNextNotAwaitedErrorArgs = ErrorOptions & MiddlewareNextNotAwaitedErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export class MiddlewareNextNotAwaitedError extends ErrorBase<MiddlewareNextNotAwaitedErrorMeta> {
  static {
    this.prototype.name = "UniKvsMiddlewareNextNotAwaitedError";
  }

  public constructor(args: MiddlewareNextNotAwaitedErrorArgs) {
    const { name, operation, ...options } = args;
    const meta: MiddlewareNextNotAwaitedErrorMeta = {
      name,
      operation,
    };
    super(
      meta,
      ({ name: messageName, operation: messageOperation }) =>
        `Middleware "${messageName}" did not await next() for ${messageOperation}.`,
      options,
    );
  }
}

setErrorMessage(
  MiddlewareNextNotAwaitedError,
  ({ name, operation }) =>
    `ミドルウェア "${name}" は ${operation} で next() を await しませんでした。`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export type MiddlewareNextCalledMultipleTimesErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
   */
  readonly name: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
   */
  readonly operation: "encode" | "decode" | "use";
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export type MiddlewareNextCalledMultipleTimesErrorArgs = ErrorOptions &
  MiddlewareNextCalledMultipleTimesErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export class MiddlewareNextCalledMultipleTimesError extends ErrorBase<MiddlewareNextCalledMultipleTimesErrorMeta> {
  static {
    this.prototype.name = "UniKvsMiddlewareNextCalledMultipleTimesError";
  }

  public constructor(args: MiddlewareNextCalledMultipleTimesErrorArgs) {
    const { name, operation, ...options } = args;
    const meta: MiddlewareNextCalledMultipleTimesErrorMeta = {
      name,
      operation,
    };
    super(
      meta,
      ({ name: messageName, operation: messageOperation }) =>
        `Middleware "${messageName}" called next() multiple times for ${messageOperation}.`,
      options,
    );
  }
}

setErrorMessage(
  MiddlewareNextCalledMultipleTimesError,
  ({ name, operation }) => `ミドルウェア "${name}" は ${operation} で next() を複数回呼びました。`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export type StreamEncodingNotSupportedErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
   */
  readonly name: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export type StreamEncodingNotSupportedErrorArgs = ErrorOptions &
  StreamEncodingNotSupportedErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export class StreamEncodingNotSupportedError extends ErrorBase<StreamEncodingNotSupportedErrorMeta> {
  static {
    this.prototype.name = "UniKvsStreamEncodingNotSupportedError";
  }

  public constructor(args: StreamEncodingNotSupportedErrorArgs) {
    const { name, ...options } = args;
    const meta: StreamEncodingNotSupportedErrorMeta = { name };
    super(
      meta,
      ({ name: messageName }) => `Middleware "${messageName}" does not support stream encoding.`,
      options,
    );
  }
}

setErrorMessage(
  StreamEncodingNotSupportedError,
  ({ name }) => `ミドルウェア "${name}" はストリームのエンコードをサポートしていません。`,
  "ja",
);

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export type StreamDecodingNotSupportedErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
   */
  readonly name: string;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export type StreamDecodingNotSupportedErrorArgs = ErrorOptions &
  StreamDecodingNotSupportedErrorMeta;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export class StreamDecodingNotSupportedError extends ErrorBase<StreamDecodingNotSupportedErrorMeta> {
  static {
    this.prototype.name = "UniKvsStreamDecodingNotSupportedError";
  }

  public constructor(args: StreamDecodingNotSupportedErrorArgs) {
    const { name, ...options } = args;
    const meta: StreamDecodingNotSupportedErrorMeta = { name };
    super(
      meta,
      ({ name: messageName }) => `Middleware "${messageName}" does not support decodable stream`,
      options,
    );
  }
}

setErrorMessage(
  StreamDecodingNotSupportedError,
  ({ name }) => `ミドルウェア "${name}" はデコード可能なストリームをサポートしていません`,
  "ja",
);

// -------------------------------------------------------------------------------------------------。
//
// ストレージ / ミドルウェア。
//
// -------------------------------------------------------------------------------------------------。

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export type PluginOperationAggregateErrorMeta = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
   */
  readonly plugin: "plugin" | "storage" | "middleware";

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
    readonly plugin: "storage" | "middleware";

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
  readonly plugin?: "storage" | "middleware";

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
    readonly plugin?: "storage" | "middleware";

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
 * プラグイン種別を正規化します。
 *
 * @param plugin 種別名です。
 *
 * @returns 正規化された種別を返します。
 */
function normalizePlugin(plugin: string): "storage" | "middleware" {
  return plugin as "storage" | "middleware";
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export class PluginOperationAggregateError extends ErrorBase<PluginOperationAggregateErrorMeta> {
  static {
    this.prototype.name = "UniKvsPluginOperationAggregateError";
  }

  public constructor(args: PluginOperationAggregateErrorArgs) {
    const { action, errors, plugin, ...options } = args;
    const normalizedErrors = errors.map((error) => ({
      plugin: normalizePlugin((error.plugin ?? plugin ?? "") as string),
      ...(error.name !== undefined ? { name: error.name } : {}),
      ...(error.index !== undefined ? { index: error.index } : {}),
      reason: error.reason,
    }));
    const plugins = [...new Set(normalizedErrors.map((error) => error.plugin))];
    const [onlyPlugin] = plugins;
    const meta: PluginOperationAggregateErrorMeta = {
      action,
      errors: normalizedErrors,
      plugin: plugins.length === 1 && onlyPlugin !== undefined ? onlyPlugin : "plugin",
    };
    super(
      meta,
      ({ action: messageAction, errors: messageErrors, plugin: messagePlugin }) =>
        `${messageErrors.length} ${messagePlugin}(s) fail ${messageAction} operation`,
      options,
    );
  }
}

setErrorMessage(
  PluginOperationAggregateError,
  ({ action, errors, plugin }) =>
    `${errors.length} 個の${
      {
        plugin: "プラグイン",
        storage: "ストレージ",
        middleware: "ミドルウェア",
      }[plugin]
    }が ${action} 操作に失敗`,
  "ja",
);

// -------------------------------------------------------------------------------------------------。
//
// その他。
//
// -------------------------------------------------------------------------------------------------。

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export class InvalidForkError extends ErrorBase<undefined> {
  static {
    this.prototype.name = "UniKvsInvalidForkError";
  }

  public constructor(options?: ErrorOptions) {
    super("A forked branch does not reach any storage", options);
  }
}

setErrorMessage(InvalidForkError, "ストレージに到達しない分岐があります", "ja");

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

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#errors)
 */
export class UnterminatedPipelineError extends ErrorBase<undefined> {
  static {
    this.prototype.name = "UniKvsUnterminatedPipelineError";
  }

  public constructor(options?: ErrorOptions) {
    super("The pipeline does not end with a storage", options);
  }
}

setErrorMessage(
  UnterminatedPipelineError,
  "パイプラインがストレージで終わっていません。use() の後に persist() または fork() を呼び出してください",
  "ja",
);
