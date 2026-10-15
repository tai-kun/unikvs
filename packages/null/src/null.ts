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
  public write(): void {}

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/null#usage)
   */
  public read(c: IStorage.ReadContext): never {
    throw new KeyNotFoundError({ key: c.key });
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/null#usage)
   */
  public exists(): false {
    return false;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/null#usage)
   */
  public delete(c: IStorage.DeleteContext): never {
    throw new KeyNotFoundError({ key: c.key });
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/null#usage)
   */
  public clear(): void {}

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/null#data)
   */
  public getWritable(): WritableStream<any> {
    return new WritableStream({
      write() {},
    });
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/null#data)
   */
  public getReadable(c: IStorage.GetReadableContext): never {
    throw new KeyNotFoundError({ key: c.key });
  }
}
