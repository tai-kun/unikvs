import withReadableStreamFrom from "./with-readable-stream-from.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/utils#to-readable-stream)
 */
export default function toReadableStream<T>(
  iterable: Iterable<T> | AsyncIterable<T>,
): ReadableStream<T> {
  return withReadableStreamFrom((ReadableStream) => ReadableStream.from(iterable));
}
