/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#concat-bytes)
 */
export function concatBytes(chunks: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#concat-chunks)
 */
export const concatChunks: typeof concatBytes = concatBytes;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#bytes-equal)
 */
export function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#create-all-byte-values)
 */
export function createAllByteValues(size: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size);

  for (let index = 0; index < size; index++) {
    bytes[index] = index % 256;
  }

  return bytes;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#create-pseudo-random-bytes)
 */
export function createPseudoRandomBytes(
  size: number,
  seed = 0x12_34_56_78,
): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size);
  let state = seed >>> 0;

  for (let index = 0; index < size; index++) {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    bytes[index] = state >>> 24;
  }

  return bytes;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#to-hex)
 */
export function toHex(bytes: Uint8Array): string {
  let hex = "";

  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }

  return hex;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#to-text)
 */
export function toText(chunks: readonly Uint8Array[]): string {
  return new TextDecoder().decode(concatBytes(chunks));
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#split-into-chunks)
 */
export function splitIntoChunks(
  bytes: Uint8Array<ArrayBuffer>,
  size: number,
): Uint8Array<ArrayBuffer>[] {
  const chunks: Uint8Array<ArrayBuffer>[] = [];

  for (let offset = 0; offset < bytes.length; offset += size) {
    chunks.push(bytes.subarray(offset, Math.min(offset + size, bytes.length)));
  }

  return chunks;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/testing#split-by-sizes)
 */
export function splitBySizes(
  data: Uint8Array<ArrayBuffer>,
  sizes: readonly number[],
): Uint8Array<ArrayBuffer>[] {
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;

  for (const size of sizes) {
    if (offset >= data.length) {
      break;
    }

    const end = Math.min(offset + size, data.length);
    chunks.push(data.subarray(offset, end));
    offset = end;
  }

  if (offset < data.length) {
    chunks.push(data.subarray(offset));
  }

  return chunks;
}
