/**
 * 決定的な疑似乱数バイト列を生成します。
 * 圧縮が効きにくい任意のバイナリでも往復が壊れないことを検証するために使用します。
 */
export function createPseudoRandomBytes(
  size: number,
  seed: number = 0x12345678,
): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size);
  let state = seed >>> 0;

  for (let index = 0; index < size; index++) {
    state = (state * 1664525 + 1013904223) >>> 0;
    bytes[index] = state >>> 24;
  }

  return bytes;
}

/**
 * 2 つのバイト列が同じ長さで各バイトが一致するかを判定します。
 * 巨大なバイト列を toStrictEqual で比較すると極端に時間がかかるため、線形走査で比較するために使用します。
 */
export function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;

  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return false;
  }

  return true;
}
