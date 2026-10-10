import { KeyNotFoundError, type IStorage } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/null#usage)
 */
export default class Null implements IStorage {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/null#usage)
   */
  public readonly name: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/null#usage)
   */
  public constructor() {
    this.name = "Null";
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/null#usage)
   */
  public get isOpen(): boolean {
    return true;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/null#usage)
   */
  public write(_args: Pick<IStorage.WriteArgs<any>, "key">): void {}

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/null#usage)
   */
  public read(args: Pick<IStorage.ReadArgs, "key">): never {
    throw new KeyNotFoundError({ key: args.key });
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/null#usage)
   */
  public exists(_args: Pick<IStorage.ExistsArgs, "key">): false {
    return false;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/null#usage)
   */
  public delete(args: Pick<IStorage.DeleteArgs, "key">): never {
    throw new KeyNotFoundError({ key: args.key });
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/null#usage)
   */
  public clear(): void {}

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/null#data)
   */
  public getWritable(_args: Pick<IStorage.GetWritableArgs, "key">): WritableStream<any> {
    return new WritableStream({
      write() {},
    });
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/null#data)
   */
  public getReadable(args: Pick<IStorage.GetReadableArgs, "key">): never {
    throw new KeyNotFoundError({ key: args.key });
  }
}
