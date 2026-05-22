/**
 * バイナリーデータ（TypedArray や DataView など）を、指定された最大バイトサイズで分割して返すジェネレーター関数です。
 *
 * @template TData バイナリーデータ（TypedArray や DataView など）の型です。
 * @param data 分割対象となる元のデータです。
 * @param maxChunkByteSize 1 つのチャンクあたりの最大バイトサイズです。
 * @yields 指定された最大バイトサイズに収まるように分割されたデータのチャンクを順次生成します。
 * @returns 分割されたデータのチャンクを順次生成するジェネレーターを返します。
 */
export default function* chunks<
  TData extends {
    /**
     * 配列内の各要素のサイズ（バイト単位）です。
     */
    readonly BYTES_PER_ELEMENT?: number;

    /**
     * 配列の長さです。
     */
    readonly length?: number;

    /**
     * 配列の長さ（バイト単位）です。
     */
    readonly byteLength: number;

    /**
     * 指定された範囲のデータのビューを作成します。
     *
     * @param start 開始オフセット（バイト単位）です。
     * @param end 終了オフセット（バイト単位）です。
     * @returns 指定された範囲を指す新しいビューを返します。
     */
    subarray(start: number, end: number): TData;
  },
>(data: TData, maxChunkByteSize: number): Generator<TData, void, unknown> {
  /**
   * 1 要素あたりのバイトサイズを取得します。
   * Int32Array なら 4、Uint8Array なら 1 となります。
   * DataView などプロパティーが存在しない場合は 1 バイトとして扱います。
   */
  const bytesPerElement = data.BYTES_PER_ELEMENT ?? 1;

  /**
   * 1 チャンクに含めることができる最大要素数を計算します。
   * バイトサイズを要素サイズで割り、小数点以下を切り捨てます。
   * 最低でも 1 要素は処理できるように Math.max(1, ...) を適用します。
   */
  const maxElementsPerChunk = Math.max(1, Math.floor(maxChunkByteSize / bytesPerElement));

  /**
   * data.length は要素数を返します（DataView の場合は undefined になるため byteLength を活用）。
   * TypedArray の要素数に基づいてループを制御します。
   */
  const totalElements = data.length ?? data.byteLength;

  /** 現在の読み取り開始位置（要素インデックス単位）を管理する変数です。 */
  let offset = 0;

  while (offset < totalElements) {
    const end = Math.min(offset + maxElementsPerChunk, totalElements);

    // 元のデータをコピーせず、指定した範囲を参照する新しいビューを作成して yield します。
    // メモリー効率を考慮し、データの再配置は行いません。
    yield data.subarray(offset, end);

    // 次のチャンクの開始位置を更新します。
    offset = end;
  }
}
