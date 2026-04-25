import withReadableStreamFrom from "./with-readable-stream-from.js";

/**
 * 反復可能オブジェクト（Iterable または AsyncIterable）を ReadableStream に変換します。
 *
 * @template T ストリーム内を流れるデータの型です。
 * @param iterable 変換対象の同期または非同期の反復可能オブジェクトです。
 * @returns 生成された ReadableStream インスタンスを返します。
 */
export default function toReadableStream<T>(
  iterable: Iterable<T> | AsyncIterable<T>,
): ReadableStream<T> {
  return withReadableStreamFrom((ReadableStream) => ReadableStream.from(iterable));
}
