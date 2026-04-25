import { ErrorBase, type ErrorOptions, setErrorMessage } from "@unikvs/core";
import getTypeName from "type-name";

export type KeyNotFoundErrorMeta = {
  readonly key: string;
};

export type KeyNotFoundErrorArgs = KeyNotFoundErrorMeta;

export class KeyNotFoundError extends ErrorBase<KeyNotFoundErrorMeta> {
  static {
    this.prototype.name = "MemoryKeyNotFoundError";
  }

  public constructor(args: KeyNotFoundErrorArgs, options?: ErrorOptions) {
    super(args, ({ key }) => `Key not found: ${key}`, options);
  }
}

setErrorMessage(KeyNotFoundError, ({ key }) => `キー ${key} が見つかりません`, "ja");

export type InvalidChunkTypeErrorMeta = {
  readonly key: string;
  readonly chunk: unknown;
  readonly chunkType: string;
};

export type InvalidChunkTypeErrorArgs = Omit<InvalidChunkTypeErrorMeta, "chunkType">;

export class InvalidChunkTypeError extends ErrorBase<InvalidChunkTypeErrorMeta> {
  static {
    this.prototype.name = "MemoryInvalidChunkTypeError";
  }

  public constructor(args: InvalidChunkTypeErrorArgs, options?: ErrorOptions) {
    super(
      {
        ...args,
        chunkType: getTypeName(args.chunk),
      },
      ({ key, chunkType }) =>
        `Expected chunk for key ${JSON.stringify(key)} is Uint8Array<ArrayBuffer>, but got ${chunkType}`,
      options,
    );
  }
}

setErrorMessage(
  InvalidChunkTypeError,
  ({ key, chunkType }) =>
    `キー ${JSON.stringify(key)} のチャンク型に Uint8Array<ArrayBuffer> を期待しましたが、${chunkType} を得ました`,
  "ja",
);
