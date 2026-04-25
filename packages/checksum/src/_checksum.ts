import type { Context, ITransformer } from "@unikvs/core";
import { chunks } from "@unikvs/utils";

import bytesToHex from "./_bytes-to-hex.js";
import { ChecksumMismatchError } from "./errors.js";

// データのサイズ単位を定義する定数群です。
const B = 1;
const KB = 1000 * B;
const MB = 1000 * KB;
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
interface IHasher {
  /**
   * チャンクデータを使ってハッシュ値計算の内需状態を更新します。
   *
   * @param data ハッシュ値を計算するチャンクデータです。
   */
  update(data: Uint8Array): void;

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
interface IHash {
  /**
   * ハッシュ値を計算します。
   *
   * @param ハッシュ値を計算するデータです。
   * @returns ハッシュ値を表す Uint8Array です。
   */
  (data: Uint8Array): Uint8Array;

  /**
   * ハッシュ値を逐次計算する IHasher を作成します。
   *
   * @returns ハッシュ値を逐次計算する IHasher です。
   */
  create(): IHasher;
}

/**
 * SHA-256 アルゴリズムを使用してデータの整合性を検証するトランスフォーマーです。
 *
 * コンテキストに含まれる期待値と、実際のデータのハッシュ値を比較します。
 */
export default abstract class Checksum implements ITransformer {
  /**
   * 期待するチェックサムを保持するコンテクストのキーです。
   */
  public static readonly CHECKSUM_CONTEXT_KEY: string;

  public readonly name: string;

  /**
   * ハッシュ値を計算する関数です。
   */
  private readonly hash: IHash;

  /**
   * Checksum の新しいインスタンスを初期化します。
   */
  public constructor(name: string, hash: IHash) {
    this.name = name;
    this.hash = hash;
  }

  public get isOpen(): boolean {
    return true;
  }

  // エンコード処理（ハッシュ検証）を実行します。
  // 検証後のバイナリーデータ（入力データと同一）を返します。
  public encode(
    args: Pick<ITransformer.EncodeArgs<Uint8Array<ArrayBuffer>>, "context" | "data">,
  ): Uint8Array<ArrayBuffer> {
    return this.#checksum(args);
  }

  // デコード処理（ハッシュ検証）を実行します。
  // 検証後のバイナリーデータ（入力データと同一）を返します。
  public decode(
    args: Pick<ITransformer.DecodeArgs<Uint8Array<ArrayBuffer>>, "context" | "data">,
  ): Uint8Array<ArrayBuffer> {
    return this.#checksum(args);
  }

  // エンコード用の TransformStream を生成します。
  // 入力データを透過させながらハッシュを計算する TransformStream を返します。
  public getEncodable(
    args: Pick<ITransformer.GetEncodableArgs, "context">,
  ): TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>> {
    return this.#createChecksumStream(args);
  }

  // デコード用の TransformStream を生成します。
  // 入力データを透過させながらハッシュを計算する TransformStream を返します。
  public getDecodable(
    args: Pick<ITransformer.GetDecodableArgs, "context">,
  ): TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>> {
    return this.#createChecksumStream(args);
  }

  /**
   * 一括データに対するハッシュ計算と検証を実行する内部メソッドです。
   *
   * @param args データとコンテキストを含むオブジェクトです。
   * @returns 入力されたデータをそのまま返します。
   * @throws {ChecksumMismatchError} コンテキストの期待値とハッシュ値が一致しない場合に投げます。
   */
  #checksum(args: { data: Uint8Array<ArrayBuffer>; context: Context }): Uint8Array<ArrayBuffer> {
    const { data, context } = args;
    const { CHECKSUM_CONTEXT_KEY } = this.constructor as typeof Checksum;
    const checksum = context[CHECKSUM_CONTEXT_KEY];
    if (typeof checksum === "string") {
      // チェックサムの指定がある場合のみ検証ロジックを走らせます。
      const hash = bytesToHex(this.hash(data));
      if (checksum !== hash) {
        throw new ChecksumMismatchError({ actual: hash, expected: checksum });
      }
    }

    // 検証が成功した、あるいは検証が不要な場合はデータを透過させます。
    return data;
  }

  /**
   * ストリーム形式で逐次的にハッシュ計算と検証を行う TransformStream を作成する内部メソッドです。
   *
   * @param args コンテキストを含むオブジェクトです。
   * @returns 変換処理を定義した TransformStream オブジェクトです。
   * @throws {ChecksumMismatchError} ストリーム終了時のハッシュ値が期待値と異なる場合に投げます。
   */
  #createChecksumStream(args: {
    context: Context;
  }): TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>> {
    const { context } = args;
    const { CHECKSUM_CONTEXT_KEY } = this.constructor as typeof Checksum;
    const checksum = context[CHECKSUM_CONTEXT_KEY];
    if (typeof checksum !== "string") {
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
