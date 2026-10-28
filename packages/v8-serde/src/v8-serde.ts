import type { IMiddleware } from "@unikvs/core";
import { toOwnedBytes } from "@unikvs/utils";
import { toAbortPromise } from "abort-signal-utils";
import { callAbortableFnOnce } from "call-fn-once";

import { type IEnv, api } from "./_core.js";
import { V8SerdeDecodeError, V8SerdeEncodeError, UnsupportedRuntimeError } from "./errors.js";

/**
 * ストリームのフレームが保持できるペイロードの最大長です。
 * 4 バイトのビッグエンディアン長で表せる上限であり、単発のエンコードには適用しません。
 */
const MAX_PAYLOAD_LENGTH = 4_294_967_295;

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
 * フレーム先頭の 4 バイトからペイロード長を読み取ります。
 *
 * @param view フレームの先頭を参照するビューです。
 *
 * @returns ペイロード長を返します。
 */
function readFrameLength(view: Uint8Array<ArrayBuffer>): number {
  return new DataView(view.buffer, view.byteOffset, view.byteLength).getUint32(0, false);
}

/**
 * バッファーに溜まった完成済みのフレームを先頭から順にデコードして下流へ流します。
 * 未完成のフレームは残して次のチャンクの到着を待ち、終了時は残余をエラーとして扱います。
 *
 * @param queue 未処理データを保持するバッファーです。
 * @param controller ストリームを制御するためのコントローラーです。
 * @param deserialize `node:v8` のデシリアライザーです。
 * @param isFinal ストリームが終了したかどうかです。終了時は残余もエラーとして扱います。
 */
function drain(
  queue: ByteQueue,
  controller: TransformStreamDefaultController<unknown>,
  deserialize: IEnv["deserialize"],
  isFinal: boolean,
): void {
  while (queue.length >= 4) {
    const view = queue.view();
    const length = readFrameLength(view);

    if (queue.length < 4 + length) {
      // フレームが途中で切れているため、次のチャンクの到着を待ちます。
      break;
    }

    // デシリアライズした型付き配列が内部バッファーを参照しないよう、必ず複写します。
    // バッファーを使い回すため、参照のままだと後続チャンクの追加で値が壊れます。
    const frame = view.slice(4, 4 + length);

    try {
      controller.enqueue(deserialize(frame));
    } catch (ex) {
      throw new V8SerdeDecodeError({ cause: ex });
    }

    queue.consume(4 + length);
  }

  if (isFinal && queue.length !== 0) {
    if (queue.length < 4) {
      throw new V8SerdeDecodeError({ cause: new Error("Incomplete v8-serde frame header") });
    }

    const view = queue.view();
    const length = readFrameLength(view);

    throw new V8SerdeDecodeError({
      cause: new Error(
        `Incomplete v8-serde frame payload: expected ${length} bytes but got ${view.byteLength - 4} bytes`,
      ),
    });
  }
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/v8-serde#usage)
 */
export default class V8Serde implements IMiddleware {
  /**
   * 実行環境の解決結果を保持するキャッシュです。
   *
   * 同じ実行環境を使い回すために利用します。
   */
  static readonly #cache: callAbortableFnOnce.CacheMap = new Map();

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/v8-serde#usage)
   */
  public readonly name: string = "V8Serde";

  /**
   * 実行環境です。
   *
   * `open()` で解決されるまでは null です。
   */
  #env: IEnv | null = null;

  /**
   * 開いているかどうかを表します。
   *
   * @returns 実行環境が設定済みなら true を返します。
   */
  public get isOpen(): boolean {
    return this.#env !== null;
  }

  /**
   * `node:v8` の実行環境を解決します。
   *
   * @param c オープン時のコンテキストです。
   *
   * @returns 初期化が完了したら解決するプロミスを返します。
   */
  public async open(c: IMiddleware.OpenContext): Promise<void> {
    try {
      this.#env = await callAbortableFnOnce(
        V8Serde.#cache,
        "api.init",
        async (signal) => {
          using abortPromise = toAbortPromise(signal);
          const env = await Promise.race([api.init(), abortPromise]);

          return env;
        },
        c.signal,
      );
    } catch (ex) {
      c.signal.throwIfAborted();
      throw new UnsupportedRuntimeError({
        name: "V8Serde",
        cause: ex,
        runtime: "Node.js",
      });
    }
  }

  /**
   * 値を `node:v8` のバイト列へ変換します。
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
    // UniKvs の仕様で先に open() が実行されるため、環境は設定済みです。
    const env = this.#requireEnv();

    try {
      c.destination = toOwnedBytes(env.serialize(c.source));
    } catch (ex) {
      throw new V8SerdeEncodeError({ cause: ex });
    }

    await next();
  }

  /**
   * `node:v8` のバイト列を値へ戻します。
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
    // UniKvs の仕様で先に open() が実行されるため、環境は設定済みです。
    const env = this.#requireEnv();

    try {
      // deserialize した型付き配列は入力バッファーを参照します。
      // 呼び出し元のバッファーを参照しないよう、必ず複写してから渡します。
      // Buffer#slice はビューを返すため、複写には使用しません。
      c.destination = env.deserialize(new Uint8Array(c.source));
    } catch (ex) {
      throw new V8SerdeDecodeError({ cause: ex });
    }

    await next();
  }

  /**
   * 値のストリームをフレーム化したバイト列ストリームへ変換します。
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
    // UniKvs の仕様で先に open() が実行されるため、環境は設定済みです。
    const env = this.#requireEnv();
    const { serialize } = env;
    c.destination = c.source.pipeThrough(
      new TransformStream<unknown, Uint8Array<ArrayBuffer>>({
        transform: (chunk, controller): void => {
          controller.enqueue(this.#encodeFrame(serialize, chunk));
        },
      }),
    );

    await next();
  }

  /**
   * フレーム化したバイト列ストリームを値のストリームへ戻します。
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
    // UniKvs の仕様で先に open() が実行されるため、環境は設定済みです。
    const env = this.#requireEnv();
    const { deserialize } = env;
    const queue = new ByteQueue();
    c.destination = c.source.pipeThrough(
      new TransformStream<Uint8Array<ArrayBuffer>, unknown>({
        flush: (controller): void => {
          drain(queue, controller, deserialize, true);
        },
        transform: (chunk, controller): void => {
          if (chunk.byteLength === 0) {
            // 空のチャンクはデコードに影響しません。
            return;
          }

          queue.append(chunk);
          drain(queue, controller, deserialize, false);
        },
      }),
    );

    await next();
  }

  /**
   * 実行環境を取得する内部メソッドです。
   *
   * UniKvs の仕様で先に open() が実行されるため、通常は設定済みです。
   *
   * @returns 設定済みの実行環境を返します。
   */
  #requireEnv(): IEnv {
    const env = this.#env;

    if (env === null) {
      throw new Error("V8Serde is not open. Call open() first.");
    }

    return env;
  }

  /**
   * 値を 4 バイトのビッグエンディアン長と本体からなるフレームへ変換する内部メソッドです。
   *
   * @param serialize `node:v8` のシリアライザーです。
   * @param data 変換する値です。
   *
   * @returns フレーム化した `Uint8Array<ArrayBuffer>` を返します。
   */
  #encodeFrame(serialize: IEnv["serialize"], data: unknown): Uint8Array<ArrayBuffer> {
    try {
      const payload = serialize(data);
      const length = payload.byteLength;

      // 4GiB を超えるペイロードは実メモリーで再現できないため、カバレッジから除外します。
      /* v8 ignore next */
      if (length > MAX_PAYLOAD_LENGTH) {
        throw new Error(
          `V8Serde payload length ${length} exceeds the maximum ${MAX_PAYLOAD_LENGTH}`,
        );
      }

      const frame = new Uint8Array(4 + length);
      new DataView(frame.buffer, frame.byteOffset, frame.byteLength).setUint32(0, length, false);
      frame.set(payload, 4);

      return frame;
    } catch (ex) {
      throw new V8SerdeEncodeError({ cause: ex });
    }
  }
}
