import { KeyNotFoundError, type IStorage } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/null#usage)
 */
export default class Null implements IStorage {
  public readonly name: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/null#usage)
   */
  public constructor() {
    this.name = "Null";
  }

  public get isOpen(): boolean {
    return true;
  }

  public write(_c: IStorage.WriteContext, _data: any): void {}

  public read(c: IStorage.ReadContext): never {
    throw new KeyNotFoundError({ key: c.key });
  }

  public exists(_c: IStorage.ExistsContext): false {
    return false;
  }

  public delete(c: IStorage.DeleteContext): never {
    throw new KeyNotFoundError({ key: c.key });
  }

  public clear(_c: IStorage.ClearContext): void {}

  public getWritable(_c: IStorage.GetWritableContext): WritableStream<any> {
    return new WritableStream({
      write() {},
    });
  }

  public getReadable(c: IStorage.GetReadableContext): never {
    throw new KeyNotFoundError({ key: c.key });
  }
}
