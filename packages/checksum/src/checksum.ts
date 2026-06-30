import type { Context, ITransformer } from "@unikvs/core";
import { chunks, bytesToHex } from "@unikvs/utils";

import {
  ChecksumMismatchError,
  ChecksumRequiredError,
  ChecksumInvalidContextKeyError,
} from "./errors.js";

/** データのサイズ単位を定義する定数です。 */
const B = 1;
/** キロバイト（1000 バイト）を表す定数です。 */
const KB = 1000 * B;
/** メガバイト（1000 KB）を表す定数です。 */
const MB = 1000 * KB;
/** ギガバイト（1000 MB）を表す定数です。 */
const GB = 1000 * MB;

/**
 * ライブラリーの制限に基づく、 1 回のハッシュ更新処理で扱える最大チャンクサイズです。noble-hashes の制限に従い、 4 GB を上限としています。
 *
 * @see https://github.com/paulmillr/noble-hashes/blob/31de71a033ea5b5d1f1084fa6532c840be1ed425/README.md?plain=1#L97
 */
const MAX_CHUNK_SIZE = 4 * GB;

/**
 * ハッシュ値を逐次計算するオブジェクトのインターフェースです。
 */
export interface IHasher {
  /**
   * チャンクデータを使ってハッシュ値計算の内需状態を更新します。
   *
   * @param data ハッシュ値を計算するチャンクデータです。
   */
  update(data: Uint8Array<ArrayBuffer>): void;

  /**
   * ハッシュ値を計算します。
   *
   * @returns ハッシュ値を表す Uint8Array です。
   */
  digest(): Uint8Array;
}

/**
 * ハッシュ値を計算する関数のインターフェースです。
 */
export interface IHash {
  /**
   * ハッシュ値を計算します。
   *
   * @param data ハッシュ値を計算するデータです。
   * @returns ハッシュ値を表す Uint8Array です。
   */
  (data: Uint8Array<ArrayBuffer>): Uint8Array;

  /**
   * ハッシュ値を逐次計算する IHasher を作成します。
   *
   * @returns ハッシュ値を逐次計算する IHasher です。
   */
  create(): IHasher;
}

/**
 * {@link Checksum} のオプションです。
 */
export type ChecksumOptions = {
  /**
   * ハッシュ値の検証を必須にするかどうかです。
   *
   * @default false
   */
  readonly required?: boolean | undefined;
};

/**
 * SHA-256 アルゴリズムを使用してデータの整合性を検証するトランスフォーマーです。
 *
 * コンテキストに含まれる期待値と、実際のデータのハッシュ値を比較します。
 */
export default abstract class Checksum implements ITransformer {
  /**
   * 期待するチェックサムを保持するコンテクストキーです。サブクラスで上書きして使用します。
   */
  public static readonly CHECKSUM_CONTEXT_KEY: string;

  /**
   * トランスフォーマーの名前です。
   */
  public readonly name: string;

  /**
   * ハッシュ値の検証を必須にするかどうかです。
   */
  public readonly required: boolean;

  /**
   * ハッシュ値を計算する関数です。
   */
  private readonly hash: IHash;

  /**
   * Checksum の新しいインスタンスを初期化します。
   *
   * @param name トランスフォーマーの名前です。デバッグメッセージなどに使用されます。
   * @param hash ハッシュ値を計算する関数です。
   * @param options オプションです。
   */
  public constructor(name: string, hash: IHash, options: ChecksumOptions = {}) {
    this.name = name;
    this.hash = hash;
    this.required = Boolean(options.required);
  }

  /**
   * トランスフォーマーが開かれているかどうかを示します。
   *
   * Checksum トランスフォーマーは常に開かれていると見なされます。
   */
  public get isOpen(): boolean {
    return true;
  }

  /**
   * エンコード処理（ハッシュ検証）を実行します。
   *
   * @param args データとコンテキストを含むオブジェクトです。
   * @returns 検証後のバイナリーデータ（入力データと同一）です。
   */
  public encode(
    args: Pick<ITransformer.EncodeArgs<Uint8Array<ArrayBuffer>>, "context" | "data">,
  ): Uint8Array<ArrayBuffer> {
    return this.#checksum(args);
  }

  /**
   * デコード処理（ハッシュ検証）を実行します。
   *
   * @param args データとコンテキストを含むオブジェクトです。
   * @returns 検証後のバイナリーデータ（入力データと同一）です。
   */
  public decode(
    args: Pick<ITransformer.DecodeArgs<Uint8Array<ArrayBuffer>>, "context" | "data">,
  ): Uint8Array<ArrayBuffer> {
    return this.#checksum(args);
  }

  /**
   * エンコード用の TransformStream を生成します。
   *
   * @param args コンテキストを含むオブジェクトです。
   * @returns 入力データを透過させながらハッシュを計算する TransformStream です。
   */
  public getEncodable(
    args: Pick<ITransformer.GetEncodableArgs, "context">,
  ): TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>> {
    return this.#checksumStream(args);
  }

  /**
   * デコード用の TransformStream を生成します。
   *
   * @param args コンテキストを含むオブジェクトです。
   * @returns 入力データを透過させながらハッシュを計算する TransformStream です。
   */
  public getDecodable(
    args: Pick<ITransformer.GetDecodableArgs, "context">,
  ): TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>> {
    return this.#checksumStream(args);
  }

  /**
   * 一括データに対するハッシュ計算と検証を実行する内部メソッドです。
   *
   * @param args データとコンテキストを含むオブジェクトです。
   * @returns 入力されたデータをそのまま返します。
   */
  #checksum(args: { data: Uint8Array<ArrayBuffer>; context: Context }): Uint8Array<ArrayBuffer> {
    const { data, context } = args;
    const { CHECKSUM_CONTEXT_KEY } = this.constructor as typeof Checksum;
    if (typeof CHECKSUM_CONTEXT_KEY !== "string") {
      throw new ChecksumInvalidContextKeyError({ actual: CHECKSUM_CONTEXT_KEY });
    }

    const checksum = context[CHECKSUM_CONTEXT_KEY];
    if (typeof checksum === "string") {
      // チェックサムの指定がある場合のみ検証ロジックを走らせます。
      const hash = bytesToHex(this.hash(data));
      if (checksum !== hash) {
        throw new ChecksumMismatchError({ actual: hash, expected: checksum });
      }
    } else if (this.required) {
      throw new ChecksumRequiredError();
    }

    // 検証が成功した、あるいは検証が不要な場合はデータを透過させます。
    return data;
  }

  /**
   * ストリーム形式で逐次的にハッシュ計算と検証を行う TransformStream を作成する内部メソッドです。
   *
   * @param args コンテキストを含むオブジェクトです。
   * @returns 変換処理を定義した TransformStream オブジェクトです。
   */
  #checksumStream(args: {
    context: Context;
  }): TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>> {
    const { context } = args;
    const { CHECKSUM_CONTEXT_KEY } = this.constructor as typeof Checksum;
    if (typeof CHECKSUM_CONTEXT_KEY !== "string") {
      throw new ChecksumInvalidContextKeyError({ actual: CHECKSUM_CONTEXT_KEY });
    }

    const checksum = context[CHECKSUM_CONTEXT_KEY];
    if (typeof checksum !== "string") {
      if (this.required) {
        throw new ChecksumRequiredError();
      }

      // チェックサムが指定されていない場合は、何も処理をしない透過ストリームを返します。
      return new TransformStream();
    }

    const hasher = this.hash.create();

    return new TransformStream({
      /**
       * ストリームの各チャンクが到達した際の処理です。
       *
       * @param chunk 入力されたバイナリーデータの一部です。
       * @param controller ストリームを制御するためのコントローラーです。
       */
      transform(chunk, controller) {
        // ライブラリーの仕様に合わせて、大きなチャンクを分割して処理します。
        for (const subChunk of chunks(chunk, MAX_CHUNK_SIZE)) {
          hasher.update(subChunk);
          // 下流のストリームへデータをそのまま流します。
          controller.enqueue(subChunk);
        }
      },

      /**
       * ストリームが終了する直前の処理です。
       */
      flush() {
        const hash = bytesToHex(hasher.digest());
        if (checksum !== hash) {
          throw new ChecksumMismatchError({ actual: hash, expected: checksum });
        }
      },
    });
  }
}
