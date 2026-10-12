/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/utils#to-owned-bytes)
 */
export default function toOwnedBytes(view: Uint8Array): Uint8Array<ArrayBuffer> {
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
