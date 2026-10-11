/**
 * チャンク列を 1 つのバイト列に連結します。
 * ストリームの分割結果を単体のバイト列と比較するために使用します。
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
 * concatBytes の別名です。
 * チャンク列を連結する処理がストリーム文脈で呼ばれる場合に使用します。
 */
export const concatChunks = concatBytes;

/**
 * 2 つのバイト列が同じ長さで各バイトが一致するかを比較します。
 * 数 MiB のデータを toStrictEqual で比較するコストを避けるために使用します。
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
 * 0 から 255 までを巡る決定的なバイト列を生成します。
 * 全バイト値を含むデータの往復検証に使用します。
 */
export function createAllByteValues(size: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size);

  for (let index = 0; index < size; index++) {
    bytes[index] = index % 256;
  }

  return bytes;
}

/**
 * 線形合同法による決定的な擬似乱数バイト列を生成します。
 * 偏りのない任意バイナリを大容量で用意するために使用します。
 */
export function createPseudoRandomBytes(size: number, seed = 0x12345678): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size);
  let state = seed >>> 0;

  for (let index = 0; index < size; index++) {
    state = (state * 1664525 + 1013904223) >>> 0;
    bytes[index] = state >>> 24;
  }

  return bytes;
}

/**
 * バイト列を小文字の 16 進文字列に変換します。
 * 実装側の変換を経由せずに期待値を組み立てるために使用します。
 */
export function toHex(bytes: Uint8Array): string {
  let hex = "";

  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }

  return hex;
}

/**
 * バイト列のチャンク列を UTF-8 の文字列へ変換します。
 * エンコード結果を文字列として比較するために使用します。
 */
export function toText(chunks: readonly Uint8Array[]): string {
  return new TextDecoder().decode(concatBytes(chunks));
}

/**
 * バイト列を指定したサイズ以下のチャンクへ分割します。
 * 任意の境界で分割しても処理できることを検証するために使用します。
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
 * バイト列を指定した長さで順に切り出します。
 * 任意の境界で分割されたチャンク列を作るために使用します。
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
