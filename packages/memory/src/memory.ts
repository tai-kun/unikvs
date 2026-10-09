import {
  KeyNotFoundError,
  RepairNotAllowedError,
  type IStorage,
  type Variables,
} from "@unikvs/core";

import { InvalidChunkTypeError } from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/memory#usage)
 */
export type MemoryOptions = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memory#usage)
   */
  readonly clone?: (<T>(value: T) => T) | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memory#usage)
   */
  readonly allowRepair?: boolean | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/memory#usage)
 */
export default class Memory implements IStorage {
  /**
   * キーと値のペアを保持する内部マップです。
   */
  private readonly map: Map<string, any>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memory#usage)
   */
  public readonly name: string;

  /**
   * データの複製に使用する関数です。
   */
  private readonly clone: <T>(value: T) => T;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memory#usage)
   */
  public readonly allowRepair: boolean;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memory#usage)
   */
  public constructor(options: MemoryOptions = {}) {
    const { clone = (value) => structuredClone(value), allowRepair = false } = options;
    this.name = "Memory";
    this.map = new Map();
    this.clone = clone;
    this.allowRepair = allowRepair;
  }

  /**
   * 書き戻しによる書き込みが許可されているかを検証します。
   *
   * @param args 書き込みの引数です。実行時変数に書き戻しの目印がある場合に判定します。
   */
  private assertRepairAllowed(args: { vars: Variables }): void {
    if (args.vars["unikvs:repair"] === true && !this.allowRepair) {
      throw new RepairNotAllowedError({ name: this.name });
    }
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memory#usage)
   */
  public get isOpen(): boolean {
    return true;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memory#usage)
   */
  public write(args: Pick<IStorage.WriteArgs<any>, "key" | "data" | "vars">): void {
    this.assertRepairAllowed(args);
    const { key, data } = args;
    this.map.set(key, this.clone(data));
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memory#usage)
   */
  public read(args: Pick<IStorage.ReadArgs, "key">): any {
    const { key } = args;
    if (!this.map.has(key)) {
      throw new KeyNotFoundError({ key });
    }

    const value = this.map.get(key);

    return this.clone(value);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memory#usage)
   */
  public exists(args: Pick<IStorage.ExistsArgs, "key">): boolean {
    const { key } = args;
    const exists = this.map.has(key);

    return exists;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memory#usage)
   */
  public delete(args: Pick<IStorage.DeleteArgs, "key">): void {
    const { key } = args;
    if (!this.map.has(key)) {
      throw new KeyNotFoundError({ key });
    }

    this.map.delete(key);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memory#usage)
   */
  public clear(): void {
    this.map.clear();
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memory#data)
   */
  public getWritable(
    args: Pick<IStorage.GetWritableArgs, "key" | "vars">,
  ): WritableStream<Uint8Array<ArrayBuffer>> {
    this.assertRepairAllowed(args);
    const { key } = args;
    // メモリーストレージにはネイティブなストリームがないため、書き込まれたチャンクを配列に保持し、クローズ時に結合して保存します。
    const chunks: Uint8Array[] = [];
    const stream = new WritableStream<Uint8Array<ArrayBuffer>>({
      write: (chunk) => {
        if (!(chunk instanceof Uint8Array)) {
          throw new InvalidChunkTypeError({ key, chunk });
        }

        chunks.push(this.clone(chunk));
      },
      close: () => {
        const totalLength = chunks.reduce((sum, c) => sum + c.byteLength, 0);
        const merged = new Uint8Array(totalLength);

        let offset = 0;
        for (const c of chunks) {
          merged.set(c, offset);
          offset += c.byteLength;
        }

        this.map.set(key, merged);
      },
    });

    return stream;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memory#data)
   */
  public getReadable(
    args: Pick<IStorage.GetReadableArgs, "key">,
  ): ReadableStream<Uint8Array<ArrayBuffer>> {
    const { key } = args;
    if (!this.map.has(key)) {
      throw new KeyNotFoundError({ key });
    }

    // メモリーストレージにはネイティブなストリームがないため、既存の値を単一チャンクとしてストリームで送出します。
    const value = this.map.get(key);
    const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
      pull: (controller) => {
        if (!(value instanceof Uint8Array)) {
          throw new InvalidChunkTypeError({ key, chunk: value });
        }

        controller.enqueue(this.clone(value) as Uint8Array<ArrayBuffer>);
        controller.close();
      },
    });

    return stream;
  }
}
