import type { ITransformer } from "@unikvs/core";
import { toOwnedBytes } from "@unikvs/utils";
import { toAbortPromise } from "abort-signal-utils";
import { callAbortableFnOnce } from "call-fn-once";

import { type IEnv, api } from "./_core.js";
import { UnsupportedRuntimeError, V8SerdeDecodeError, V8SerdeEncodeError } from "./errors.js";

/**
 * ストリームのフレームが保持できるペイロードの最大長です。
 * 4 バイトのビッグエンディアン長で表せる上限であり、単発のエンコードには適用しません。
 */
const MAX_PAYLOAD_LENGTH = 0xffffffff;

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
    const length = new DataView(view.buffer, view.byteOffset, view.byteLength).getUint32(0, false);

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
    const length = new DataView(view.buffer, view.byteOffset, view.byteLength).getUint32(0, false);

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
export default class V8Serde implements ITransformer {
  /**
   * 実行環境の解決結果を保持するキャッシュです。
   */
  private static readonly cache: callAbortableFnOnce.CacheMap = new Map();

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/v8-serde#usage)
   */
  public readonly name: string = "V8Serde";

  /**
   * 実行環境です。
   */
  private env: IEnv | null = null;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/v8-serde#usage)
   */
  public get isOpen(): boolean {
    return this.env !== null;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/v8-serde#usage)
   */
  public async open(args: Pick<ITransformer.OpenArgs, "signal">): Promise<void> {
    const { signal } = args;
    try {
      this.env = await callAbortableFnOnce(
        V8Serde.cache,
        "api.init",
        async (signal) => {
          using abortPromise = toAbortPromise(signal);
          const env = await Promise.race([api.init(), abortPromise]);

          return env;
        },
        signal,
      );
    } catch (ex) {
      signal.throwIfAborted();
      throw new UnsupportedRuntimeError({
        name: "V8Serde",
        cause: ex,
        runtime: "Node.js",
      });
    }
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/v8-serde#usage)
   */
  public async encode(
    args: Pick<ITransformer.EncodeArgs<unknown>, "data">,
  ): Promise<Uint8Array<ArrayBuffer>> {
    const env = this.env!; // UniKvs の仕様で先に open() が実行されるため、これは非 null です。
    const { data } = args;

    try {
      return toOwnedBytes(api.serialize(env, data));
    } catch (ex) {
      throw new V8SerdeEncodeError({ cause: ex });
    }
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/v8-serde#usage)
   */
  public async decode(
    args: Pick<ITransformer.DecodeArgs<Uint8Array<ArrayBuffer>>, "data">,
  ): Promise<unknown> {
    const env = this.env!; // UniKvs の仕様で先に open() が実行されるため、これは非 null です。
    const { data } = args;

    try {
      return api.deserialize(env, data);
    } catch (ex) {
      throw new V8SerdeDecodeError({ cause: ex });
    }
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/v8-serde#streams)
   */
  public getEncodable(): TransformStream<unknown, Uint8Array<ArrayBuffer>> {
    // 理由: ITransformer.getEncodable は MaybePromise を返すため同期返却でも型互換があり、既存テストの `await target.getEncodable()` も非 Promise 値をそのまま受け取れる。
    // zstd.node と同様に open() 済み前提で同期化する。
    const env = this.env!; // UniKvs の仕様で先に open() が実行されるため、これは非 null です。
    const { serialize } = env;

    return new TransformStream<unknown, Uint8Array<ArrayBuffer>>({
      transform: (chunk, controller) => {
        controller.enqueue(this.#encodeFrame(serialize, chunk));
      },
    });
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/v8-serde#streams)
   */
  public getDecodable(): TransformStream<Uint8Array<ArrayBuffer>, unknown> {
    // 理由: ITransformer.getDecodable は MaybePromise を返すため同期返却でも型互換があり、既存テストの `await target.getDecodable()` も非 Promise 値をそのまま受け取れる。
    // zstd.node と同様に open() 済み前提で同期化する。
    const env = this.env!; // UniKvs の仕様で先に open() が実行されるため、これは非 null です。
    const { deserialize } = env;
    const queue = new ByteQueue();

    return new TransformStream<Uint8Array<ArrayBuffer>, unknown>({
      transform: (chunk, controller) => {
        if (chunk.byteLength === 0) {
          // 空のチャンクはデコードに影響しません。
          return;
        }

        queue.append(chunk);
        drain(queue, controller, deserialize, false);
      },
      flush: (controller) => {
        drain(queue, controller, deserialize, true);
      },
    });
  }

  /**
   * 値を 4 バイトのビッグエンディアン長と本体からなるフレームへ変換する内部メソッドです。
   *
   * @param serialize `node:v8` のシリアライザーです。
   * @param data 変換する値です。
   * @returns フレーム化した `Uint8Array<ArrayBuffer>` を返します。
   */
  #encodeFrame(serialize: IEnv["serialize"], data: unknown): Uint8Array<ArrayBuffer> {
    try {
      const payload = serialize(data);
      const length = payload.byteLength;

      // 理由: 4GiB を超えるペイロードは実メモリーで再現できないため、カバレッジから除外します。
      /* v8 ignore if */ if (length > MAX_PAYLOAD_LENGTH) {
        /* v8 ignore next */ throw new Error(
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
