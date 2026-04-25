import logger from "./_logger.js";

/**
 * `from` 静的メソッドを持つ `ReadableStream` の拡張型定義です。
 */
interface ReadableStreamWithFrom extends ReadableStream {
  /**
   * 反復可能オブジェクト（Iterable または AsyncIterable）から `ReadableStream` を生成します。
   *
   * @template T チャンクの型です。
   * @param iterable ストリームに変換する反復可能オブジェクトです。
   * @returns 生成された `ReadableStream` です。
   */
  from<T>(iterable: Iterable<T> | AsyncIterable<T>): ReadableStream<T>;
}

/**
 * @param cb 実行されるコールバック関数です。
 * @returns 返り値を使用するべきではありません。
 * @deprecated コールバック関数は同期関数である必要があります。
 */
function withReadableStreamFrom(
  cb: (ReadableStream: ReadableStreamWithFrom) => PromiseLike<any>,
): never;

/**
 * `ReadableStream.from` が未実装の環境において、一時的にポリフィルを適用してコールバックを実行します。
 *
 * @template T コールバックの戻り値の型です。
 * @param cb 実行されるコールバック関数です。
 * @returns コールバック関数の実行結果です。
 */
function withReadableStreamFrom<T>(cb: (ReadableStream: ReadableStreamWithFrom) => T): T;

function withReadableStreamFrom(cb: (ReadableStream: ReadableStreamWithFrom) => unknown) {
  if ("from" in ReadableStream) {
    // 既に ReadableStream.from が存在する場合は、そのままコールバックを実行します。
    return cb(ReadableStream as any);
  }

  try {
    // 一時的に ReadableStream オブジェクトへ from メソッドを定義します。
    (ReadableStream as any).from = function ReadableStreamFrom<T>(
      iterable: Iterable<T> | AsyncIterable<T>,
    ): ReadableStream<T> {
      const iter =
        // 備考: (Symbol.iterator in iterable) をすると、iterable が文字列のとき chromium でエラーになります。
        typeof (iterable as any)[Symbol.iterator] === "function"
          ? // @ts-expect-error
            iterable[Symbol.iterator]()
          : // @ts-expect-error
            iterable[Symbol.asyncIterator]();

      /** ストリームの終了状態を管理するフラグです。 */
      let done = false;

      return new ReadableStream<T>({
        async pull(controller) {
          if (done) {
            return;
          }

          try {
            const result = await iter.next();
            if (result.done) {
              done = true;
              controller.close();
            } else {
              controller.enqueue(result.value);
            }
          } catch (ex) {
            done = true;
            controller.error(ex);
          }
        },
        async cancel(reason) {
          done = true;
          try {
            await iter.return?.(reason);
          } catch (ex) {
            logger.error`Failed to close iterator: ${ex}`;
          }
        },
      });
    };

    // ポリフィルが適用された状態の ReadableStream を渡してコールバックを実行します。
    return cb(ReadableStream as any);
  } finally {
    // 他の処理への影響を最小限にするため、実行後は必ず一時的に追加した from メソッドを削除します。
    delete (ReadableStream as any).from;
  }
}

export default withReadableStreamFrom;
