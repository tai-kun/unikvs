/**
 * 値を非同期に流すための読み取り専用ストリームを定義するインターフェースです。
 *
 * `ReadableStream` を拡張しており、標準的なストリーム操作に加えて非同期イテレーターによる反復処理をサポートします。
 *
 * @template T ストリームを流れるデータの型です。
 */
export interface ValueStream<T = any>
  extends
    Omit<ReadableStream, keyof AsyncDisposable | keyof AsyncIteratorObject<T>>,
    AsyncDisposable,
    AsyncIteratorObject<T, void, void> {
  dispose(): Promise<void>;
}
