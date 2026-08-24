import { ErrorBase, type ErrorOptions, setErrorMessage } from "@unikvs/core";
import getTypeName from "type-name";

/**
 * 指定されたキーがストレージ内に存在しないことを示すエラーメタデータ型です。
 */
export type KeyNotFoundErrorMeta = {
  /**
   * 存在しなかったキーです。
   */
  readonly key: string;
};

/**
 * {@link KeyNotFoundError} のコンストラクター引数型です。
 *
 * エラーの追加情報 (`cause`) も含みます。
 */
export type KeyNotFoundErrorArgs = ErrorOptions & KeyNotFoundErrorMeta;

/**
 * 読み取りまたは削除を実行しようとしたキーがストレージ内に存在しない場合に投げられるエラーです。
 */
export class KeyNotFoundError extends ErrorBase<KeyNotFoundErrorMeta> {
  static {
    this.prototype.name = "MemoryKeyNotFoundError";
  }

  /**
   * KeyNotFoundError インスタンスを初期化します。
   *
   * @param args エラーメタデータとエラーの追加情報です。
   */
  public constructor(args: KeyNotFoundErrorArgs) {
    const { key, ...options } = args;
    const meta: KeyNotFoundErrorMeta = { key };
    super(meta, ({ key }) => `Key not found: ${key}`, options);
  }
}

setErrorMessage(KeyNotFoundError, ({ key }) => `キー ${key} が見つかりません`, "ja");

/**
 * ストリーム書き込み時に無効なチャンク型が渡されたことを示すエラーメタデータ型です。
 */
export type InvalidChunkTypeErrorMeta = {
  /**
   * 書き込み先または読み取り元のキーです。
   */
  readonly key: string;

  /**
   * 型が無効だったチャンクの値です。
   */
  readonly chunk: unknown;

  /**
   * 実際に渡されたチャンク値の型名です。
   */
  readonly chunkType: string;
};

/**
 * {@link InvalidChunkTypeError} のコンストラクター引数型です。
 *
 * `chunkType` はコンストラクター内部で自動的に設定されるため、引数からは除外されています。
 * また、エラーの追加情報 (`cause`) も含みます。
 */
export type InvalidChunkTypeErrorArgs = ErrorOptions & Omit<InvalidChunkTypeErrorMeta, "chunkType">;

/**
 * `getWritable` が返すストリームに `Uint8Array<ArrayBuffer>` 以外の値が書き込まれた場合に投げられるエラーです。
 */
export class InvalidChunkTypeError extends ErrorBase<InvalidChunkTypeErrorMeta> {
  static {
    this.prototype.name = "MemoryInvalidChunkTypeError";
  }

  /**
   * InvalidChunkTypeError インスタンスを初期化します。
   *
   * @param args エラーメタデータとエラーの追加情報です。
   */
  public constructor(args: InvalidChunkTypeErrorArgs) {
    const { key, chunk, ...options } = args;
    const meta: InvalidChunkTypeErrorMeta = { key, chunk, chunkType: getTypeName(chunk) };
    super(
      meta,
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
