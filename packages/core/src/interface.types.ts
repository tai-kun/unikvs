/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-streams)
 */
export interface IReadableStream<TData = any> extends ReadableStream<TData> {}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/core#storage-streams)
 */
export interface IWritableStream<TData = any> extends WritableStream<TData> {}

export interface ITransformStream<TInput = any, TOutput = any> {
  readonly readable: IReadableStream<TOutput>;
  readonly writable: IWritableStream<TInput>;
}
