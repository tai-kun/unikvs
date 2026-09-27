/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#value-stream)
 */
export interface ValueStream<T = any>
  extends
    Omit<ReadableStream, keyof AsyncDisposable | keyof AsyncIterable<unknown>>,
    AsyncDisposable,
    AsyncIterable<T, void, unknown> {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#value-stream)
   */
  dispose: (this: void) => Promise<void>;
}
