import type { ITransformer } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/passthrough#usage)
 */
export default class PassThrough implements ITransformer {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/passthrough#usage)
   */
  public readonly name: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/passthrough#usage)
   */
  public constructor() {
    this.name = "PassThrough";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/passthrough#usage)
   */
  public get isOpen(): boolean {
    return true;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/passthrough#usage)
   */
  public encode<TData>(args: Pick<ITransformer.EncodeArgs<TData>, "data">): TData {
    return args.data;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/passthrough#usage)
   */
  public decode<TData>(args: Pick<ITransformer.DecodeArgs<TData>, "data">): TData {
    return args.data;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/passthrough#streams)
   */
  public getEncodable(): TransformStream<any, any> {
    return new TransformStream();
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/passthrough#streams)
   */
  public getDecodable(): TransformStream<any, any> {
    return new TransformStream();
  }
}
