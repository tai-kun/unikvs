import type { IMiddleware, IPipelineContext } from "@unikvs/core";
import { chunks, bytesToHex } from "@unikvs/utils";

import {
  ChecksumMismatchError,
  ChecksumRequiredError,
  ChecksumInvalidVarNameError,
  ChecksumInvalidRequiredError,
} from "./errors.js";

/**
 * データのサイズ単位を定義する定数です。
 */
const B = 1;

/**
 * キロバイト（1000 バイト）を表す定数です。
 */
const KB = 1000 * B;

/**
 * メガバイト（1000 KB）を表す定数です。
 */
const MB = 1000 * KB;

/**
 * ギガバイト（1000 MB）を表す定数です。
 */
const GB = 1000 * MB;

/**
 * ライブラリーの制限に基づく、1 回のハッシュ更新処理で扱える最大チャンクサイズです。noble-hashes の制限に従い、4 GB を上限としています。
 *
 * @see https://github.com/paulmillr/noble-hashes/blob/31de71a033ea5b5d1f1084fa6532c840be1ed425/README.md?plain=1#L97
 */
const MAX_CHUNK_SIZE = 4 * GB;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#ihasher)
 */
export interface IHasher {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#ihasher-update)
   */
  update(data: Uint8Array<ArrayBuffer>): void;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#ihasher-digest)
   */
  digest(): Uint8Array;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#ihash)
 */
export interface IHash {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#ihash)
   */
  (data: Uint8Array<ArrayBuffer>): Uint8Array;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#ihash-create)
   */
  create(): IHasher;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#checksum)
 */
export type ChecksumOptions = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#checksum-required)
   */
  readonly required?: boolean | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#checksum)
 */
export default abstract class Checksum implements IMiddleware {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#checksum)
   */
  public static readonly CHECKSUM_VAR_NAME: string;

  public readonly name: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#checksum-required)
   */
  public readonly required: boolean;

  /**
   * ハッシュ値を計算する関数です。
   */
  readonly #hash: IHash;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/checksum#checksum)
   */
  public constructor(name: string, hash: IHash, options: ChecksumOptions = {}) {
    const { required = false } = options;

    if (typeof required !== "boolean") {
      throw new ChecksumInvalidRequiredError({ actual: required });
    }

    this.name = name;
    this.#hash = hash;
    this.required = required;
  }

  public get isOpen(): boolean {
    return true;
  }

  public async encode(
    c: IMiddleware.EncodeContext<Uint8Array<ArrayBuffer>>,
    next: IMiddleware.INext,
  ): Promise<void> {
    c.destination = this.#checksum(c.source, c);

    await next();
  }

  public async decode(
    c: IMiddleware.DecodeContext<Uint8Array<ArrayBuffer>>,
    next: IMiddleware.INext,
  ): Promise<void> {
    c.destination = this.#checksum(c.source, c);

    await next();
  }

  public async encodeStream(
    c: IMiddleware.EncodeStreamContext<Uint8Array<ArrayBuffer>>,
    next: IMiddleware.INext,
  ): Promise<void> {
    c.destination = c.source.pipeThrough(this.#checksumStream(c));

    await next();
  }

  public async decodeStream(
    c: IMiddleware.DecodeStreamContext<Uint8Array<ArrayBuffer>>,
    next: IMiddleware.INext,
  ): Promise<void> {
    c.destination = c.source.pipeThrough(this.#checksumStream(c));

    await next();
  }

  /**
   * 一括データに対するハッシュ計算と検証を実行する内部メソッドです。
   *
   * @param data 検証するデータです。
   * @param c チェックサム変数を保持するコンテキストです。
   *
   * @returns 入力されたデータをそのまま返します。
   */
  #checksum(data: Uint8Array<ArrayBuffer>, c: IPipelineContext): Uint8Array<ArrayBuffer> {
    const { CHECKSUM_VAR_NAME } = this.constructor as typeof Checksum;

    if (typeof CHECKSUM_VAR_NAME !== "string") {
      throw new ChecksumInvalidVarNameError({ actual: CHECKSUM_VAR_NAME });
    }

    const checksum = c.get(CHECKSUM_VAR_NAME);

    if (typeof checksum === "string") {
      // チェックサムの指定がある場合のみ検証ロジックを走らせます。
      const hash = bytesToHex(this.#hash(data));

      if (checksum !== hash) {
        throw new ChecksumMismatchError({
          actual: hash,
          expected: checksum,
        });
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
   * @param c チェックサム変数を保持するコンテキストです。
   *
   * @returns 変換処理を定義した TransformStream オブジェクトです。
   */
  #checksumStream(
    c: IPipelineContext,
  ): TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>> {
    const { CHECKSUM_VAR_NAME } = this.constructor as typeof Checksum;

    if (typeof CHECKSUM_VAR_NAME !== "string") {
      throw new ChecksumInvalidVarNameError({ actual: CHECKSUM_VAR_NAME });
    }

    const checksum = c.get(CHECKSUM_VAR_NAME);

    if (typeof checksum !== "string") {
      if (this.required) {
        throw new ChecksumRequiredError();
      }

      // チェックサムが指定されていない場合は、何も処理をしない透過ストリームを返します。
      return new TransformStream();
    }

    const hasher = this.#hash.create();

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
          throw new ChecksumMismatchError({
            actual: hash,
            expected: checksum,
          });
        }
      },
    });
  }
}
