import type { IMiddleware } from "@unikvs/core";
import { toOwnedBytes } from "@unikvs/utils";
import { decode, encode, Decoder } from "cbor-x";

import { CborDecodeError, CborEncodeError } from "./errors.js";

/**
 * cbor-x のデコードが入力不足で失敗したときのエラーの形です。
 */
type IncompleteDecodeError = Error & {
  /**
   * 入力不足によるエラーであることを表すフラグです。
   */
  incomplete: true;

  /**
   * 未完成のデータアイテムの開始位置です。
   */
  lastPosition: number;
};

/**
 * cbor-x が投げたエラーが入力不足の可能性があるかを判定します。
 *
 * cbor-x は RegExp の途中で入力が切れると incomplete フラグを付けずに SyntaxError を投げます。
 *
 * @param error cbor-x が投げたエラーです。
 *
 * @returns 入力不足の可能性があるエラーなら true を返します。
 */
function isPossiblyIncompleteInputError(error: unknown): error is IncompleteDecodeError {
  // プリミティブ値が渡されても安全にプロパティーを参照できるよう、Object で包みます。
  const candidate = Object(error) as Partial<IncompleteDecodeError>;

  // 開始位置が数値でない場合は、キューを消費すると壊れるため入力不足として扱いません。
  if (typeof candidate.lastPosition !== "number") {
    return false;
  }

  return candidate.incomplete === true || error instanceof SyntaxError;
}

/**
 * 受信チャンクを蓄積する、容量が自動で拡張されるバイトバッファーです。
 * 小さなチャンクが大量に届いても、コピー回数が全体で線形に収まるようにするために使用します。
 */
class ByteQueue {
  /**
   * チャンクを保持する内部バッファーです。
   */
  #bytes: Uint8Array<ArrayBuffer> = new Uint8Array(0);

  /**
   * 未処理データの先頭位置です。
   */
  #readOffset = 0;

  /**
   * 未処理データの終端位置です。
   */
  #writeOffset = 0;

  /**
   * 未処理データの長さを返します。
   */
  public get length(): number {
    return this.#writeOffset - this.#readOffset;
  }

  /**
   * チャンクを末尾へ追加します。
   *
   * @param chunk 追加するバイト列です。
   */
  public append(chunk: Uint8Array<ArrayBuffer>): void {
    const required = this.#writeOffset + chunk.byteLength;

    if (required > this.#bytes.byteLength) {
      // 必要な容量と現在の容量の倍のうち大きい方を確保し、未処理データを先頭へ詰めます。
      const capacity = Math.max(required, this.#bytes.byteLength * 2, 16);
      const bytes = new Uint8Array(capacity);
      bytes.set(this.#bytes.subarray(this.#readOffset, this.#writeOffset));
      this.#bytes = bytes;

      this.#writeOffset -= this.#readOffset;
      this.#readOffset = 0;
    }

    this.#bytes.set(chunk, this.#writeOffset);
    this.#writeOffset += chunk.byteLength;
  }

  /**
   * 未処理データへのビューを返します。
   *
   * @returns 未処理データを参照する `Uint8Array` を返します。
   */
  public view(): Uint8Array<ArrayBuffer> {
    return this.#bytes.subarray(this.#readOffset, this.#writeOffset);
  }

  /**
   * 先頭から指定した長さのデータを消費済みにします。
   *
   * @param length 消費する長さです。
   */
  public consume(length: number): void {
    this.#readOffset += length;
    if (this.#readOffset === this.#writeOffset) {
      this.#readOffset = 0;
      this.#writeOffset = 0;
    }
  }
}

/**
 * 完成済みの値を下流へ流します。
 *
 * @param controller ストリームを制御するためのコントローラーです。
 * @param values 下流へ流す値の配列です。
 */
function enqueueValues(
  controller: TransformStreamDefaultController<unknown>,
  values: readonly unknown[],
): void {
  for (const value of values) {
    controller.enqueue(value);
  }
}

/**
 * バッファーに溜まったデータを先頭から順にデコードして下流へ流します。
 * cbor-x の `decodeMultiple` にコールバックを渡して完成済みの値を収集し、入力不足なら残りを次回へ持ち越します。
 *
 * @param decoder cbor-x のデコーダーです。
 * @param queue 未処理データを保持するバッファーです。
 * @param controller ストリームを制御するためのコントローラーです。
 * @param isFinal ストリームが終了したかどうかです。終了時は入力不足もエラーとして扱います。
 */
function drain(
  decoder: Decoder,
  queue: ByteQueue,
  controller: TransformStreamDefaultController<unknown>,
  isFinal: boolean,
): void {
  if (queue.length === 0) {
    return;
  }

  const view = queue.view();
  const values: unknown[] = [];

  try {
    decoder.decodeMultiple(view, (value: unknown) => {
      values.push(value);
    });

    enqueueValues(controller, values);
    queue.consume(view.byteLength);
  } catch (ex) {
    if (isFinal) {
      // 終了時に残ったデータは入力不足でもエラーです。完成済みの値は流してからエラーにします。
      enqueueValues(controller, values);
      throw new CborDecodeError({ cause: ex });
    }

    // 入力不足の可能性があるエラーは、終了時まで待ってからエラーにします。
    if (!isPossiblyIncompleteInputError(ex)) {
      throw new CborDecodeError({ cause: ex });
    }

    // データが途中で切れているため、完成済みの分だけ流して次のチャンクの到着を待ちます。
    enqueueValues(controller, values);
    queue.consume(ex.lastPosition);
  }
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cbor#usage)
 */
export default class Cbor implements IMiddleware {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cbor#usage)
   */
  public readonly name: string = "Cbor";

  /**
   * 常に利用可能であることを表します。
   *
   * @returns 常に true を返します。
   */
  public get isOpen(): boolean {
    return true;
  }

  /**
   * 値を CBOR のバイト列へ変換します。
   *
   * @param c エンコード対象の値を持つコンテキストです。
   * @param next 次のミドルウェアへ処理を渡す関数です。
   *
   * @returns 変換が完了したら解決するプロミスを返します。
   */
  public async encode(
    c: IMiddleware.EncodeContext<unknown, Uint8Array<ArrayBuffer>>,
    next: IMiddleware.INext,
  ): Promise<void> {
    c.destination = this.#encode(c.source);

    await next();
  }

  /**
   * CBOR のバイト列を値へ戻します。
   *
   * @param c デコード対象のバイト列を持つコンテキストです。
   * @param next 次のミドルウェアへ処理を渡す関数です。
   *
   * @returns 変換が完了したら解決するプロミスを返します。
   */
  public async decode(
    c: IMiddleware.DecodeContext<Uint8Array<ArrayBuffer>, unknown>,
    next: IMiddleware.INext,
  ): Promise<void> {
    try {
      c.destination = decode(c.source);
    } catch (ex) {
      throw new CborDecodeError({ cause: ex });
    }

    await next();
  }

  /**
   * 値のストリームを CBOR のバイト列ストリームへ変換します。
   *
   * @param c エンコード対象の値ストリームを持つコンテキストです。
   * @param next 次のミドルウェアへ処理を渡す関数です。
   *
   * @returns 変換の設定が完了したら解決するプロミスを返します。
   */
  public async encodeStream(
    c: IMiddleware.EncodeStreamContext<unknown, Uint8Array<ArrayBuffer>>,
    next: IMiddleware.INext,
  ): Promise<void> {
    c.destination = c.source.pipeThrough(
      new TransformStream<unknown, Uint8Array<ArrayBuffer>>({
        transform: (chunk, controller): void => {
          controller.enqueue(this.#encode(chunk));
        },
      }),
    );

    await next();
  }

  /**
   * CBOR のバイト列ストリームを値のストリームへ戻します。
   *
   * @param c デコード対象のバイト列ストリームを持つコンテキストです。
   * @param next 次のミドルウェアへ処理を渡す関数です。
   *
   * @returns 変換の設定が完了したら解決するプロミスを返します。
   */
  public async decodeStream(
    c: IMiddleware.DecodeStreamContext<Uint8Array<ArrayBuffer>, unknown>,
    next: IMiddleware.INext,
  ): Promise<void> {
    // copyBuffers を有効にすると、デコードした型付き配列が内部バッファーを参照しなくなります。
    // バッファーを使い回すため、参照のままだと後続チャンクの追加で値が壊れます。
    const decoder = new Decoder({
      useRecords: false,
      copyBuffers: true,
    });
    const queue = new ByteQueue();
    c.destination = c.source.pipeThrough(
      new TransformStream<Uint8Array<ArrayBuffer>, unknown>({
        flush: (controller): void => {
          drain(decoder, queue, controller, true);
        },
        transform: (chunk, controller): void => {
          if (chunk.byteLength === 0) {
            // 空のチャンクはデコードに影響しません。
            return;
          }

          queue.append(chunk);
          drain(decoder, queue, controller, false);
        },
      }),
    );

    await next();
  }

  /**
   * 値を CBOR のバイト列へ変換する内部メソッドです。
   *
   * @param data 変換する値です。
   *
   * @returns CBOR に変換した `Uint8Array<ArrayBuffer>` を返します。
   */
  #encode(data: unknown): Uint8Array<ArrayBuffer> {
    try {
      return toOwnedBytes(encode(data));
    } catch (ex) {
      throw new CborEncodeError({ cause: ex });
    }
  }
}
