import type { IMiddleware } from "@unikvs/core";
import { toOwnedBytes } from "@unikvs/utils";
import { Decoder, decode, encode } from "cbor-x";

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

  /**
   * 未完成のデータアイテムより前にデコードされた値です。
   */
  values?: unknown[];
};

/**
 * cbor-x が投げたエラーが入力不足の可能性があるかを判定します。
 *
 * cbor-x は RegExp の途中で入力が切れると incomplete フラグを付けずに SyntaxError を投げます。
 *
 * @param error cbor-x が投げたエラーです。
 * @returns 入力不足の可能性があるエラーなら true を返します。
 */
function isPossiblyIncompleteInputError(error: unknown): error is IncompleteDecodeError {
  // プリミティブ値が渡されても安全にプロパティーを参照できるよう、Object で包みます。
  return Object(error).incomplete === true || error instanceof SyntaxError;
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
 * 入力不足エラーに含まれる完成済みの値を下流へ流します。
 *
 * @param controller ストリームを制御するためのコントローラーです。
 * @param error cbor-x が投げたエラーです。
 */
function enqueueValues(
  controller: TransformStreamDefaultController<unknown>,
  error: unknown,
): void {
  const values = (error as Partial<IncompleteDecodeError>).values;
  for (const value of values ?? []) {
    controller.enqueue(value);
  }
}

/**
 * バッファーに溜まったデータを先頭から順にデコードして下流へ流します。
 * cbor-x の `decodeMultiple` は、完成済みの値の配列を返すか、入力不足なら
 * `incomplete` フラグと完成済みの値を持つエラーを投げます。
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

  try {
    // forEach を渡さない場合はデコード済みの値の配列が返るため、型を合わせてキャストします。
    const values = decoder.decodeMultiple(view) as unknown as unknown[];
    for (const value of values) {
      controller.enqueue(value);
    }
    queue.consume(view.byteLength);
  } catch (ex) {
    if (isFinal) {
      // 終了時に残ったデータは入力不足でもエラーです。完成済みの値は流してからエラーにします。
      enqueueValues(controller, ex);
      throw new CborDecodeError({ cause: ex });
    }

    // 入力不足の可能性があるエラーは、終了時まで待ってからエラーにします。
    if (!isPossiblyIncompleteInputError(ex)) {
      throw new CborDecodeError({ cause: ex });
    }

    // データが途中で切れているため、完成済みの分だけ流して次のチャンクの到着を待ちます。
    enqueueValues(controller, ex);
    queue.consume(ex.lastPosition);
  }
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cbor#usage)
 */
export default class Cbor implements IMiddleware {
  public readonly name: string = "Cbor";

  public get isOpen(): boolean {
    return true;
  }

  public async encode(
    c: IMiddleware.EncodeContext<unknown, Uint8Array<ArrayBuffer>>,
    next: IMiddleware.INext,
  ): Promise<void> {
    c.destination = this.#encode(c.source);

    await next();
  }

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

  public async encodeStream(
    c: IMiddleware.EncodeStreamContext<unknown, Uint8Array<ArrayBuffer>>,
    next: IMiddleware.INext,
  ): Promise<void> {
    c.destination = c.source.pipeThrough(
      new TransformStream<unknown, Uint8Array<ArrayBuffer>>({
        transform: (chunk, controller) => {
          controller.enqueue(this.#encode(chunk));
        },
      }),
    );

    await next();
  }

  public async decodeStream(
    c: IMiddleware.DecodeStreamContext<Uint8Array<ArrayBuffer>, unknown>,
    next: IMiddleware.INext,
  ): Promise<void> {
    // copyBuffers を有効にすると、デコードした型付き配列が内部バッファーを参照しなくなります。
    // バッファーを使い回すため、参照のままだと後続チャンクの追加で値が壊れます。
    const decoder = new Decoder({ useRecords: false, copyBuffers: true });
    const queue = new ByteQueue();

    c.destination = c.source.pipeThrough(
      new TransformStream<Uint8Array<ArrayBuffer>, unknown>({
        transform: (chunk, controller) => {
          if (chunk.byteLength === 0) {
            // 空のチャンクはデコードに影響しません。
            return;
          }

          queue.append(chunk);
          drain(decoder, queue, controller, false);
        },
        flush: (controller) => {
          drain(decoder, queue, controller, true);
        },
      }),
    );

    await next();
  }

  /**
   * 値を CBOR のバイト列へ変換する内部メソッドです。
   *
   * @param data 変換する値です。
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
