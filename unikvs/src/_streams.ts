import type { IReadableStream, IWritableStream } from "@unikvs/core";

/**
 * 値が `ReadableStream` のインターフェースを満たすかどうかを判定します。
 *
 * ランタイムによっては `ReadableStream` クラスを継承せずに同じインターフェースを備えたオブジェクトが存在するため、`instanceof` ではなく必要なメソッドの有無で判定します。
 *
 * @param input 判定する値です。
 * @returns `ReadableStream` のインターフェースを満たす場合は `true` を返します。
 */
export function isReadableStream(input: unknown): input is IReadableStream {
  if (typeof input !== "object" || input === null) {
    return false;
  }

  const stream = input as Partial<IReadableStream>;

  return (
    typeof stream.getReader === "function" &&
    typeof stream.pipeThrough === "function" &&
    typeof stream.pipeTo === "function" &&
    typeof stream.tee === "function" &&
    typeof stream.cancel === "function"
  );
}

/**
 * 値が `WritableStream` のインターフェースを満たすかどうかを判定します。
 *
 * ランタイムによっては `WritableStream` クラスを継承せずに同じインターフェースを備えたオブジェクトが存在するため、`instanceof` ではなく必要なメソッドの有無で判定します。
 *
 * @param input 判定する値です。
 * @returns `WritableStream` のインターフェースを満たす場合は `true` を返します。
 */
export function isWritableStream(input: unknown): input is IWritableStream {
  if (typeof input !== "object" || input === null) {
    return false;
  }

  const stream = input as Partial<IWritableStream>;

  return (
    typeof stream.getWriter === "function" &&
    typeof stream.abort === "function" &&
    typeof stream.close === "function"
  );
}

/**
 * ストリームの重複を除いてキャンセルします。
 *
 * 個々のキャンセルに失敗しても無視し、元の例外を優先して伝えます。
 *
 * @param streams キャンセルするストリームです。
 * @param reason キャンセル理由です。
 */
export async function cancelStreams(
  streams: Iterable<{ cancel(reason?: unknown): Promise<void> }>,
  reason: unknown,
): Promise<void> {
  // 同じ参照は 1 回だけキャンセルします。
  await Promise.all(
    [...new Set(streams)].map(async (stream) => {
      try {
        await stream.cancel(reason);
      } catch {
        // キャンセルに失敗しても元の例外の伝播を優先します。
      }
    }),
  );
}
