import { type IStorage, KeyNotFoundError } from "@unikvs/core";

import { InvalidChunkTypeError } from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/memory#usage)
 */
export type MemoryOptions = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memory#usage)
   */
  readonly clone?: (<T>(value: T) => T) | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/memory#usage)
 */
export default class Memory implements IStorage {
  /**
   * キーと値のペアを保持する内部マップです。
   */
  readonly #map: Map<string, any>;

  public readonly name: string;

  /**
   * データの複製に使用する関数です。
   */
  readonly #clone: <T>(value: T) => T;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memory#usage)
   */
  public constructor(options: MemoryOptions = {}) {
    const { clone = <T>(value: T): T => structuredClone(value) } = options;

    this.name = "Memory";
    this.#map = new Map();
    this.#clone = clone;
  }

  public get isOpen(): boolean {
    return true;
  }

  // oxlint-disable-next-line typescript/explicit-module-boundary-types
  public write(c: IStorage.WriteContext, data: any): void {
    this.#map.set(c.key, this.#clone(data));
  }

  public read(c: IStorage.ReadContext): any {
    if (!this.#map.has(c.key)) {
      throw new KeyNotFoundError({ key: c.key });
    }

    const value = this.#map.get(c.key);

    return this.#clone(value);
  }

  public exists(c: IStorage.ExistsContext): boolean {
    const exists = this.#map.has(c.key);

    return exists;
  }

  public delete(c: IStorage.DeleteContext): void {
    if (!this.#map.has(c.key)) {
      throw new KeyNotFoundError({ key: c.key });
    }

    this.#map.delete(c.key);
  }

  public clear(_c: IStorage.ClearContext): void {
    this.#map.clear();
  }

  public getWritable(c: IStorage.GetWritableContext): WritableStream<Uint8Array<ArrayBuffer>> {
    // メモリーストレージにはネイティブなストリームがないため、書き込まれたチャンクを配列に保持し、クローズ時に結合して保存します。
    const chunks: Uint8Array[] = [];
    const stream = new WritableStream<Uint8Array<ArrayBuffer>>({
      close: (): void => {
        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
        const merged = new Uint8Array(totalLength);

        let offset = 0;

        for (const chunk of chunks) {
          merged.set(chunk, offset);
          offset += chunk.byteLength;
        }

        this.#map.set(c.key, merged);
      },
      write: (chunk): void => {
        if (!(chunk instanceof Uint8Array)) {
          throw new InvalidChunkTypeError({
            key: c.key,
            chunk,
          });
        }

        chunks.push(this.#clone(chunk));
      },
    });

    return stream;
  }

  public getReadable(c: IStorage.GetReadableContext): ReadableStream<Uint8Array<ArrayBuffer>> {
    if (!this.#map.has(c.key)) {
      throw new KeyNotFoundError({ key: c.key });
    }

    // メモリーストレージにはネイティブなストリームがないため、既存の値を単一チャンクとしてストリームで送出します。
    const value = this.#map.get(c.key);
    const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
      pull: (controller): void => {
        if (!(value instanceof Uint8Array)) {
          throw new InvalidChunkTypeError({
            key: c.key,
            chunk: value,
          });
        }

        controller.enqueue(this.#clone(value) as Uint8Array<ArrayBuffer>);
        controller.close();
      },
    });

    return stream;
  }
}
