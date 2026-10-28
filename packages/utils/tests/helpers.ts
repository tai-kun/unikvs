/**
 * `ReadableStream.from` を一時的に削除して処理を実行し、終了後に元へ戻します。
 *
 * `ReadableStream.from` が存在しない環境でのポリフィル経路を検証するために使用します。
 * 元のプロパティーが存在しなかった場合は、`undefined` を設定するのではなく削除したままにします。
 *
 * @param fn 実行する処理です。
 *
 * @returns 処理の結果です。
 */
export async function withoutReadableStreamFrom<T>(fn: () => T | Promise<T>): Promise<T> {
  const streamConstructor = ReadableStream as typeof ReadableStream & { from?: unknown };
  const descriptor = Object.getOwnPropertyDescriptor(streamConstructor, "from");
  delete streamConstructor.from;

  try {
    return await fn();
  } finally {
    if (descriptor === undefined) {
      delete streamConstructor.from;
    } else {
      Object.defineProperty(streamConstructor, "from", descriptor);
    }
  }
}
