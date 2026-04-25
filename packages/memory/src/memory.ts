import type { IStorage } from "@unikvs/core";

import { InvalidChunkTypeError, KeyNotFoundError } from "./errors.js";

/**
 * メモリーを永続化先として使用するストレージクラスです。
 */
export default class Memory implements IStorage {
  private readonly map: Map<string, any>;

  public readonly name: string;

  /**
   * Memory インスタンスを初期化します。
   */
  public constructor() {
    this.name = "Memory";
    this.map = new Map();
  }

  public get isOpen(): boolean {
    return true;
  }

  public write(args: Pick<IStorage.WriteArgs<any>, "key" | "data">): void {
    const { key, data } = args;
    this.map.set(key, data);
  }

  public read(args: Pick<IStorage.ReadArgs, "key">): any {
    const { key } = args;
    if (!this.map.has(key)) {
      throw new KeyNotFoundError({ key });
    }

    const value = this.map.get(key);

    return value;
  }

  public exists(args: Pick<IStorage.ExistsArgs, "key">): boolean {
    const { key } = args;
    const exists = this.map.has(key);

    return exists;
  }

  public delete(args: Pick<IStorage.DeleteArgs, "key">): void {
    const { key } = args;
    if (!this.map.has(key)) {
      throw new KeyNotFoundError({ key });
    }

    this.map.delete(key);
  }

  public clear(): void {
    this.map.clear();
  }

  public getWritable(
    args: Pick<IStorage.GetWritableArgs, "key">,
  ): WritableStream<Uint8Array<ArrayBuffer>> {
    const { key } = args;
    const chunks: Uint8Array[] = [];
    const stream = new WritableStream<Uint8Array<ArrayBuffer>>({
      write: (chunk) => {
        if (!(chunk instanceof Uint8Array)) {
          throw new InvalidChunkTypeError({ key, chunk });
        }

        chunks.push(chunk);
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

  public getReadable(
    args: Pick<IStorage.GetReadableArgs, "key">,
  ): ReadableStream<Uint8Array<ArrayBuffer>> {
    const { key } = args;
    if (!this.map.has(key)) {
      throw new KeyNotFoundError({ key });
    }

    const value = this.map.get(key);
    const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
      pull: (controller) => {
        if (!(value instanceof Uint8Array)) {
          throw new InvalidChunkTypeError({ key, chunk: value });
        }

        controller.enqueue(value as Uint8Array<ArrayBuffer>);
        controller.close();
      },
    });

    return stream;
  }
}
