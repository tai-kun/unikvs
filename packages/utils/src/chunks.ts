/**
 * `subarray` で範囲ビューを作れるバイナリーデータの形です。
 */
interface ITypedArray {
  /**
   * 1 要素あたりのバイト数です。
   */
  readonly BYTES_PER_ELEMENT?: number;

  /**
   * 要素数です。
   */
  readonly length?: number;

  /**
   * バイト数です。
   */
  readonly byteLength: number;

  /**
   * 指定範囲のビューを作ります。
   *
   * @param start 開始要素位置です。
   * @param end 終了要素位置です。
   * @returns 指定範囲のビューです。
   */
  subarray(start: number, end: number): unknown;
}

/**
 * 全体サイズを指定サイズで区切るときの範囲を順に作ります。
 *
 * 大きさは小数点以下を切り捨て、最低でも 1 として扱います。
 *
 * @param totalSize 全体の大きさです。
 * @param maxSize 1 区切りあたりの最大サイズです。
 * @yields 開始位置と終了位置の組を順に生成します。
 */
function* chunkRanges(totalSize: number, maxSize: number): Generator<readonly [number, number]> {
  const size = Math.max(1, Math.floor(maxSize));
  let offset = 0;

  while (offset < totalSize) {
    const end = Math.min(offset + size, totalSize);
    yield [offset, end];
    offset = end;
  }
}

/**
 * バイナリーデータを指定された最大バイトサイズで分割して返します。
 *
 * DataView と TypedArray のいずれも受け付けます。
 *
 * @template TData 分割対象となるデータの型です。
 * @param data 分割対象となる元のデータです。
 * @param maxChunkByteSize 1 つのチャンクあたりの最大バイトサイズです。
 * @yields 指定された最大バイトサイズに収まるように分割されたデータのチャンクを順次生成します。
 * @returns 分割されたデータのチャンクを順次生成するジェネレーターを返します。
 */
export default function* chunks<TData extends DataView | ITypedArray>(
  data: TData,
  maxChunkByteSize: number,
): Generator<TData, void, unknown> {
  if (data instanceof DataView) {
    // DataView には subarray がないため、バッファー範囲で切り出します。
    for (const [start, end] of chunkRanges(data.byteLength, maxChunkByteSize)) {
      yield new DataView(data.buffer, data.byteOffset + start, end - start) as TData;
    }

    return;
  }

  const view = data as ITypedArray;
  const bytesPerElement = view.BYTES_PER_ELEMENT ?? 1;
  const totalElements = view.length ?? view.byteLength;

  for (const [start, end] of chunkRanges(totalElements, maxChunkByteSize / bytesPerElement)) {
    yield view.subarray(start, end) as TData;
  }
}
