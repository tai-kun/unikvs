import { ErrorBase, type ErrorOptions, setErrorMessage } from "@unikvs/core";
import getTypeName from "type-name";

/**
 * 指定されたキーがストレージ内に存在しないことを示すエラーメタデータ型です。
 */
export type KeyNotFoundErrorMeta = {
  readonly key: string;
};

/**
 * {@link KeyNotFoundError} のコンストラクター引数型です。
 */
export type KeyNotFoundErrorArgs = KeyNotFoundErrorMeta;

/**
 * 読み取りまたは削除を実行しようとしたキーがストレージ内に存在しない場合に投げられるエラーです。
 */
export class KeyNotFoundError extends ErrorBase<KeyNotFoundErrorMeta> {
  static {
    this.prototype.name = "MemoryKeyNotFoundError";
  }

  public constructor(args: KeyNotFoundErrorArgs, options?: ErrorOptions) {
    super(args, ({ key }) => `Key not found: ${key}`, options);
  }
}

setErrorMessage(KeyNotFoundError, ({ key }) => `キー ${key} が見つかりません`, "ja");

/**
 * ストリーム書き込み時に無効なチャンク型が渡されたことを示すエラーメタデータ型です。
 */
export type InvalidChunkTypeErrorMeta = {
  readonly key: string;
  readonly chunk: unknown;
  readonly chunkType: string;
};

/**
 * {@link InvalidChunkTypeError} のコンストラクター引数型です。
 *
 * `chunkType` はコンストラクター内部で自動的に設定されるため、引数からは除外されています。
 */
export type InvalidChunkTypeErrorArgs = Omit<InvalidChunkTypeErrorMeta, "chunkType">;

/**
 * `getWritable` が返すストリームに `Uint8Array<ArrayBuffer>` 以外の値が書き込まれた場合に投げられるエラーです。
 */
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
