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
  return createValueStream(readableStream, onAsyncDispose).valueStream;
}

/**
 * {@linkcode toValueStream} の戻り値に、破棄ハンドルを追加したものです。
 *
 * @template T ストリームが保持する値の型です。
 */
export type ValueStreamHandle<T> = {
  /**
   * 非同期イテレーターが付与された `ValueStream` インスタンスです。
   */
  readonly valueStream: ValueStream<T>;

  /**
   * ストリームを破棄する関数です。
   *
   * ソースストリームのキャンセルと `onAsyncDispose` の実行を行います。
   * `valueStream` 自身を参照しないため、この関数を保持しても
   * `valueStream` のガベージコレクションを妨げません。
   */
  readonly dispose: () => Promise<void>;
};

/**
 * 与えられた `IReadableStream` を `ValueStream` と破棄ハンドルに変換します。
 *
 * @template T ストリームが保持する値の型です。
 * @param readableStream 変換対象となる `IReadableStream` インスタンスです。
 * @param onAsyncDispose ストリーム破棄時の処理です。
 * @returns `ValueStream` インスタンスと破棄ハンドルを返します。
 */
export function createValueStream<T>(
  readableStream: IReadableStream<T>,
  onAsyncDispose: () => Promise<void>,
): ValueStreamHandle<T> {
  const cacheMap = new Map();
  const reader = readableStream.getReader();

  async function disposeValueStream(): Promise<void> {
    await callAsyncableFnOnce(cacheMap, "dispose", async () => {
      try {
        await reader.cancel();
      } catch (ex) {
        logger.error`Failed to cancel the source stream: ${ex}`;
      }

      await onAsyncDispose();
    });
  }

  // cancel・エラー・早期 break であっても dispose されるように、readable 側のキャンセルを直接フックしたストリームを返します。
  const valueStream = new ReadableStream<T>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          // ストリームが正常に完了したことも dispose 対象とし、完了を通知する前に破棄を完了させます。
          await disposeValueStream();
          controller.close();
        } else {
          controller.enqueue(value);
        }
      } catch (ex) {
        // ソースエラー時も dispose (ロック解放など) を行わないと、ストリームを放棄した consumer に対してキーの I/O ロックがリークします。
        // dispose 自体が失敗しても元の例外の伝播を壊さないように、失敗はログに残すだけにします。
        await disposeValueStream().catch((e) => logger.error`Failed to dispose value stream: ${e}`);
        controller.error(ex);
      }
    },

    async cancel() {
      await disposeValueStream();
    },
  });

  const stream = Object.assign(
    valueStream,

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
          // cancel・エラー・早期 break など完了方法に関係なくストリームを破棄し、キーの読み取りロックがリークしないようにします (2 回目以降は no-op)。
          try {
            await disposeValueStream();
          } catch (ex) {
            logger.error`Failed to dispose value stream: ${ex}`;
          }

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

  return { valueStream: stream, dispose: disposeValueStream };
}
