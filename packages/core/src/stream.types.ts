/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/stream#overview)
 */
export interface IReadableStream<TChunk = any> extends ReadableStream<TChunk> {}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/stream#overview)
 */
export interface IWritableStream<TChunk = any> extends WritableStream<TChunk> {}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core/stream#itransformstream)
 */
export interface ITransformStream<TIn = any, TOut = any> {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/stream#itransformstream-readable)
   */
  readonly readable: IReadableStream<TOut>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/core/stream#itransformstream-writable)
   */
  readonly writable: IWritableStream<TIn>;
}
