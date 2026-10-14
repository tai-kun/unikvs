/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#value-stream)
 */
export interface IValueStream<T = any>
  extends
    Omit<ReadableStream, keyof AsyncDisposable | keyof AsyncIterable<unknown>>,
    AsyncDisposable,
    AsyncIterable<T, void, unknown> {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#value-stream)
   */
  dispose: (this: void) => Promise<void>;
}

declare global {
  interface UniKvsVariablesTypes {
    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#variables)
     */
    readonly "unikvs:action":
      | "open"
      | "close"
      | "set"
      | "get"
      | "stream"
      | "has"
      | "delete"
      | "clear";

    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#variables)
     */
    readonly "unikvs:key": string;

    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#variables)
     */
    readonly "unikvs:storageNames": readonly string[];

    /**
     * [API Reference](https://tai-kun.github.io/unikvs/packages/unikvs#variables)
     */
    readonly "unikvs:repair": boolean;
  }
}
