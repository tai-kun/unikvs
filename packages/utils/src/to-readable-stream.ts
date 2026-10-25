import withReadableStreamFrom from "./with-readable-stream-from.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/utils#to-readable-stream)
 */
export default function toReadableStream<T>(
  iterable: Iterable<T> | AsyncIterable<T>,
): ReadableStream<T> {
  // WebKit のネイティブ from は文字列などのプリミティブを受け付けないため、配列に変換して渡します。
  const source: Iterable<T> | AsyncIterable<T> =
    typeof iterable === "string" ? (Array.from(iterable) as Iterable<T>) : iterable;

  return withReadableStreamFrom((ReadableStream) => ReadableStream.from(source));
}
