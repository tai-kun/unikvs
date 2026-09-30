import type { IStorage } from "@unikvs/core";

import { KeyNotFoundError } from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#usage)
 */
export type WriteOnlyOptions = {
  readonly allowDelete?: boolean | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#usage)
 */
export default class WriteOnly implements IStorage {
  /**
   * 書き込みを委譲する内部ストレージです。
   */
  private readonly storage: IStorage;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#usage)
   */
  public readonly name: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#usage)
   */
  public readonly allowDelete: boolean;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#streams)
   */
  public getWritable?: NonNullable<IStorage["getWritable"]>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#usage)
   */
  public constructor(storage: IStorage, options: WriteOnlyOptions = {}) {
    this.name = "WriteOnly";
    this.storage = storage;
    this.allowDelete = Boolean(options.allowDelete);

    // 内部ストレージが対応している場合のみ、書き込み用ストリームを透過的に公開します。
    const { getWritable } = storage;
    if (typeof getWritable === "function") {
      this.getWritable = getWritable.bind(storage);
    }
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#usage)
   */
  public get isOpen(): boolean {
    return this.storage.isOpen;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#usage)
   */
  public async open(args: IStorage.OpenArgs): Promise<void> {
    await this.storage.open?.(args);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#usage)
   */
  public async close(args: IStorage.CloseArgs): Promise<void> {
    await this.storage.close?.(args);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#usage)
   */
  public async onOtherWriteError(args: IStorage.OnOtherWriteErrorArgs): Promise<void> {
    await this.storage.onOtherWriteError?.(args);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#usage)
   */
  public async write(args: IStorage.WriteArgs<any>): Promise<void> {
    await this.storage.write(args);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#usage)
   */
  public read(args: Pick<IStorage.ReadArgs, "key">): never {
    throw new KeyNotFoundError({ key: args.key });
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#usage)
   */
  public exists(_args: Pick<IStorage.ExistsArgs, "key">): false {
    return false;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#usage)
   */
  public delete(args: IStorage.DeleteArgs): void | Promise<void> {
    if (!this.allowDelete) {
      return;
    }

    return this.storage.delete(args);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#usage)
   */
  public clear(args: IStorage.ClearArgs): void | Promise<void> {
    if (!this.allowDelete) {
      return;
    }

    return this.storage.clear(args);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/writeonly#usage)
   */
  public getReadable(args: Pick<IStorage.GetReadableArgs, "key">): never {
    throw new KeyNotFoundError({ key: args.key });
  }
}
