/**
 * バイト列を `ArrayBuffer` を所有する `Uint8Array` へ正規化します。
 *
 * 所有済みであれば複写せずに返し、共有域を参照していれば複写して所有化します。
 * `Buffer` など子クラスの場合も、専有域であれば複写せず素の `Uint8Array` で包んで返します。
 *
 * @param view 正規化するバイト列です。
 * @returns 所有化した `Uint8Array<ArrayBuffer>` を返します。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/utils#to-owned-view)
 */
export default function toOwnedView(view: Uint8Array): Uint8Array<ArrayBuffer> {
  if (
    view.buffer instanceof ArrayBuffer &&
    view.byteOffset === 0 &&
    view.byteLength === view.buffer.byteLength
  ) {
    if (view.constructor === Uint8Array) {
      return view as Uint8Array<ArrayBuffer>;
    }

    return new Uint8Array(view.buffer);
  }

  const copy = new Uint8Array(view.byteLength);
  copy.set(view);

  return copy;
}
