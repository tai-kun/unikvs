import type { IReadableStream } from "@unikvs/core";
import { callAsyncableFnOnce } from "call-fn-once";

import logger from "./_logger.js";
import type { ValueStream } from "./value-stream.types.js";

/**
 * 与えられた `IReadableStream` を `ValueStream` に変換します。
 *
 * @template T ストリームが保持する値の型です。
 * @param readableStream 変換対象となる `IReadableStream` インスタンスです。
 * @param onAsyncDispose ストリーム破棄時の処理です。
 * @returns 非同期イテレーターが付与された `ValueStream` インスタンスを返します。
 */
export default function toValueStream<T>(
  readableStream: IReadableStream<T>,
  onAsyncDispose: () => Promise<void>,
): ValueStream<T> {
  const cacheMap = new Map();
  async function disposeValueStream(): Promise<void> {
    await callAsyncableFnOnce(cacheMap, "dispose", onAsyncDispose);
  }

  return Object.assign(
    // ReadableStream
    readableStream.pipeThrough(
      new TransformStream({
        flush: disposeValueStream,
      }),
    ),

    // AsyncDisposable
    {
      [Symbol.asyncDispose]: disposeValueStream,
    },

    // { dispose(): Promise<void> }
    {
      dispose: disposeValueStream,
    },

    // AsyncIterable<T, void, unknown>
    {
      async *[Symbol.asyncIterator](this: ReadableStream<T>) {
        const r = this.getReader();
        try {
          // ストリームが終了するまでループを回し、チャンクを読み取ります。
          while (true) {
            const { done, value } = await r.read();
            if (done) {
              break;
            }

            yield value;
          }
        } catch (ex) {
          // エラーが発生した場合は、リーダーのキャンセルを試みます。
          try {
            await r.cancel(ex);
          } catch (ex) {
            logger.error`Failed to cancel reader: ${ex}`;
          }

          throw ex;
        } finally {
          // 最後に必ずリーダーのロックを解放し、ストリームを再利用可能な状態にします。
          try {
            r.releaseLock();
          } catch (ex) {
            logger.error`Failed to release reader's lock: ${ex}`;
          }
        }
      },
    },
  );
}
