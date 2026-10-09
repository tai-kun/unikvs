import type { ITransformer } from "@unikvs/core";
import { callAsyncableFnOnce } from "call-fn-once";

import { UnsupportedRuntimeError, V8SerdeDecodeError, V8SerdeEncodeError } from "./errors.js";

/**
 * ストリームのフレームが保持できるペイロードの最大長です。
 * 4 バイトのビッグエンディアン長で表せる上限であり、単発のエンコードには適用しません。
 */
const MAX_PAYLOAD_LENGTH = 0xffffffff;

/**
 * `node:v8` モジュールの解決結果を保持するキャッシュです。
 * 同一キーへの同時呼び出しは同一の promise を共有します。
 */
const v8Cache: callAsyncableFnOnce.CacheMap = new Map();

/**
 * `node:v8` モジュールを遅延解決します。
 * 解決は初回のみ実行し、失敗時はキャッシュを破棄して再試行できるようにします。
 *
 * @returns 解決した `node:v8` モジュールを返します。
 */
async function loadV8(): Promise<typeof import("node:v8")> {
  return await callAsyncableFnOnce(v8Cache, "v8", async () => {
    // 理由: 非 Node 環境での import 失敗は Node.js の CI では再現できないため、カバレッジから除外します。
    try {
      return await import("node:v8");
    } catch (ex) /* v8 ignore next */ {
      throw new UnsupportedRuntimeError({ name: "V8Serde", runtime: "Node.js", cause: ex });
    }
  });
}

/**
 * バイト列をコピーせずに `Uint8Array<ArrayBuffer>` へ正規化します。
 *
 * @param view 正規化するバイト列です。
 * @returns 同じメモリーを参照する `Uint8Array<ArrayBuffer>` を返します。
 */
function toAllocatedView(view: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(view.buffer as ArrayBuffer, view.byteOffset, view.byteLength);
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
  deserialize: (data: Uint8Array<ArrayBuffer>) => unknown,
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
   * [API Reference](https://tai-kun.github.io/unikvs/packages/v8-serde#usage)
   */
  public readonly name: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/v8-serde#usage)
   */
  public constructor() {
    this.name = "V8Serde";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/v8-serde#usage)
   */
  public get isOpen(): boolean {
    return true;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/v8-serde#usage)
   */
  public async encode(
    args: Pick<ITransformer.EncodeArgs<unknown>, "data">,
  ): Promise<Uint8Array<ArrayBuffer>> {
    const { serialize } = await loadV8();

    try {
      return toAllocatedView(serialize(args.data));
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
    const { deserialize } = await loadV8();

    try {
      return deserialize(args.data);
    } catch (ex) {
      throw new V8SerdeDecodeError({ cause: ex });
    }
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/v8-serde#streams)
   */
  public async getEncodable(): Promise<TransformStream<unknown, Uint8Array<ArrayBuffer>>> {
    const { serialize } = await loadV8();

    return new TransformStream<unknown, Uint8Array<ArrayBuffer>>({
      transform: (chunk, controller) => {
        controller.enqueue(this.#encodeFrame(serialize, chunk));
      },
    });
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/v8-serde#streams)
   */
  public async getDecodable(): Promise<TransformStream<Uint8Array<ArrayBuffer>, unknown>> {
    const { deserialize } = await loadV8();
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
  #encodeFrame(serialize: (data: unknown) => Uint8Array, data: unknown): Uint8Array<ArrayBuffer> {
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
